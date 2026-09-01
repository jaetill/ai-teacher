// POST /api/copilot/accept-draft
// Auth: requires Google OAuth session (Drive access token).
//
// The explicit-consent half of the draft protocol (see src/lib/draft-protocol.ts
// and claude/assessment-builder-decisions-2026-07-30.md in the project docs):
// the copilot only ever PROPOSES drafts; nothing is written to the teacher's
// Drive until she clicks Accept & Create, which calls this route. It then:
//   1. creates a Google Doc from the draft text, placed in the app's own
//      grade/quarter/category folder (where lesson materials link from — NOT
//      the teacher's hand-sorted folders),
//   2. inserts a materials row (source: "ai") so the doc appears in the
//      course's material pool,
//   3. optionally attaches it to a lesson or unit when the draft named one
//      and it resolves unambiguously to this owner's curriculum.
// Creation-only by design: this route never modifies or replaces an existing
// file. A revised draft is accepted as a NEW doc (new version).

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAccessToken } from "@/lib/auth-helpers";
import { db } from "@/db";
import {
  copilotConversations,
  courses,
  driveFolders,
  lessons,
  materialAttachments,
  materials,
  units,
} from "@/db/schema";
import { and, eq, isNull, or } from "drizzle-orm";
import { createDoc, createFromSpec, createSheet, createSlides } from "@/lib/drive";
import { parseSpec, type DraftSpec } from "@/lib/draft-spec";
import { buildFolderKey, type MaterialType } from "@/lib/upload-utils";
import { normalizeMaterialType, normalizeQuarter } from "@/lib/draft-protocol";
import {
  normalizeDraftFormat,
  parseSlideOutline,
  tsvToCsv,
  type DraftFormat,
} from "@/lib/draft-formats";
import { readJson, UUID_RE } from "@/lib/api-utils";
import { refuse } from "@/lib/error-log";
import { logEdit } from "../../curriculum/editor/log-edit";

// Which category folder an accepted draft lands in, by material type.
const TYPE_TO_CATEGORY: Record<MaterialType, string> = {
  reading: "Resources",
  activity: "Activities",
  rubric: "Assessments",
  lesson: "Lessons",
  assessment: "Assessments",
  resource: "Resources",
  curriculum: "Curriculum",
  other: "Resources",
};

// What each format produces in Drive, and how the material row records it.
const FORMAT_MIME: Record<DraftFormat, string> = {
  doc: "application/vnd.google-apps.document",
  sheet: "application/vnd.google-apps.spreadsheet",
  slides: "application/vnd.google-apps.presentation",
};

const FORMAT_LABEL: Record<DraftFormat, string> = {
  doc: "Google Doc",
  sheet: "Google Sheet",
  slides: "Google Slides deck",
};

type AcceptDraftBody = {
  title?: string;
  content?: string;
  format?: string;
  materialType?: string;
  grade?: number;
  quarter?: string;
  unitTitle?: string;
  lessonTitle?: string;
  conversationId?: string;
  /** Present when the draft came from a propose_* tool call. */
  spec?: unknown;
};

const MAX_TITLE_CHARS = 200;
const MAX_CONTENT_CHARS = 100_000;

const ROUTE = "/api/copilot/accept-draft";

/**
 * The structured, non-identifying part of a Google API error.
 *
 * error_events.detail is documented as counts, sizes and limits only — never
 * message text, filenames or file contents. Google's error sentences routinely
 * embed document titles, folder paths, file ids and email addresses, so the
 * raw message must not go in there. The HTTP status and Google's own reason
 * code carry the diagnostic value without carrying her data: the Slides
 * object-ID bug reads as 400/badRequest, a revoked token as 401, a folder she
 * cannot write to as 403/forbidden.
 */
function googleErrorFacts(err: unknown): { googleStatus: number | null; googleReason: string | null } {
  const e = err as {
    code?: unknown;
    status?: unknown;
    errors?: { reason?: unknown }[];
    response?: { status?: unknown; data?: { error?: { errors?: { reason?: unknown }[] } } };
  };
  const rawStatus = e?.response?.status ?? e?.status ?? e?.code;
  const googleStatus = typeof rawStatus === "number" ? rawStatus : Number(rawStatus) || null;
  const reason =
    e?.errors?.[0]?.reason ?? e?.response?.data?.error?.errors?.[0]?.reason ?? null;
  return {
    googleStatus,
    // Reason codes are a closed vocabulary from Google (badRequest,
    // forbidden, notFound…). Bounded and sanitised so an unexpected shape
    // cannot smuggle prose in.
    googleReason:
      typeof reason === "string" ? reason.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 60) : null,
  };
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const ownerEmail = session?.user?.email;
  if (!ownerEmail) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const accessToken = await getAccessToken(req);
  if (!accessToken) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await readJson<AcceptDraftBody>(req);
  if (!body) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const content = typeof body.content === "string" ? body.content : "";
  if (!title || !content.trim()) {
    return Response.json({ error: "title and content are required" }, { status: 400 });
  }
  if (title.length > MAX_TITLE_CHARS) {
    return Response.json({ error: `title too long (max ${MAX_TITLE_CHARS})` }, { status: 413 });
  }
  if (content.length > MAX_CONTENT_CHARS) {
    return Response.json({ error: `content too large (max ${MAX_CONTENT_CHARS})` }, { status: 413 });
  }
  if (body.conversationId && !UUID_RE.test(body.conversationId)) {
    return Response.json({ error: "Bad conversationId" }, { status: 400 });
  }

  const materialType = normalizeMaterialType(body.materialType);

  // A spec is the styled path. It is re-parsed here rather than trusted from
  // the client: it arrives through the browser, so the same rule applies as
  // anywhere else — validate at the boundary, never at the source.
  const spec: DraftSpec | null = body.spec
    ? parseSpec((body.spec as { kind?: unknown }).kind, body.spec)
    : null;

  // The spec's own kind wins, so the file's mime type can never disagree with
  // what was actually built.
  const format = spec ? spec.kind : normalizeDraftFormat(body.format);

  // Reject a body that cannot become the file it claims to be, before any
  // Drive write — an empty deck or a one-column "spreadsheet" is a worse
  // outcome for her than being told the draft was malformed.
  // These guard the TEXT formats only. A spec has already been validated by
  // parseSpec, which returns null rather than an empty deck or a headerless
  // sheet, so re-checking it against tab characters would be nonsense.
  if (!spec && format === "sheet" && !content.includes("\t")) {
    return Response.json(
      { error: "This draft is not tab-separated, so it cannot become a spreadsheet." },
      { status: 400 }
    );
  }
  const slideOutline = !spec && format === "slides" ? parseSlideOutline(content) : [];
  if (!spec && format === "slides" && slideOutline.length === 0) {
    return Response.json(
      { error: "This draft has no '# Slide title' headings, so it cannot become a deck." },
      { status: 400 }
    );
  }
  let grade = [6, 7, 8].includes(body.grade as number) ? (body.grade as number) : null;
  let quarter = normalizeQuarter(body.quarter);

  // ── Resolve optional placement (lesson first, else unit) ───
  // Titles come from the model, which saw the real titles in its curriculum
  // context — but resolution is best-effort: no match (or an out-of-owner
  // match) simply means "no attachment", never an error. The doc still lands
  // in the pool, where drag-to-lesson already works well for this teacher.
  let attachTo: { type: "lesson" | "unit"; id: string; title: string; courseId: string } | null = null;

  if (body.lessonTitle && typeof body.lessonTitle === "string") {
    const rows = await db
      .select({
        id: lessons.id,
        title: lessons.title,
        quarter: units.quarter,
        courseId: courses.id,
        grade: courses.grade,
      })
      .from(lessons)
      .innerJoin(units, eq(lessons.unitId, units.id))
      .innerJoin(courses, eq(units.courseId, courses.id))
      .where(
        and(
          eq(courses.ownerEmail, ownerEmail),
          eq(lessons.title, body.lessonTitle.trim())
        )
      )
      .limit(2);
    const filtered = grade != null ? rows.filter((r) => r.grade === grade) : rows;
    if (filtered.length >= 1) {
      const hit = filtered[0];
      attachTo = { type: "lesson", id: hit.id, title: hit.title, courseId: hit.courseId };
      grade = grade ?? hit.grade;
      quarter = quarter ?? normalizeQuarter(hit.quarter);
    }
  }

  if (!attachTo && body.unitTitle && typeof body.unitTitle === "string") {
    const rows = await db
      .select({
        id: units.id,
        title: units.title,
        quarter: units.quarter,
        courseId: courses.id,
        grade: courses.grade,
      })
      .from(units)
      .innerJoin(courses, eq(units.courseId, courses.id))
      .where(
        and(
          eq(courses.ownerEmail, ownerEmail),
          eq(units.title, body.unitTitle.trim())
        )
      )
      .limit(2);
    const filtered = grade != null ? rows.filter((r) => r.grade === grade) : rows;
    if (filtered.length >= 1) {
      const hit = filtered[0];
      attachTo = { type: "unit", id: hit.id, title: hit.title, courseId: hit.courseId };
      grade = grade ?? hit.grade;
      quarter = quarter ?? normalizeQuarter(hit.quarter);
    }
  }

  // ── Resolve destination Drive folder ───
  // Preferred: the grade/quarter category folder (that's what the material
  // pool query is keyed on — see editor/pool/route.ts). Fallback: the app
  // root folder; last resort: no parent (Drive root). The doc is created
  // either way; only pool visibility degrades on the fallbacks.
  const category = TYPE_TO_CATEGORY[materialType];
  const candidateKeys: string[] = [];
  if (grade != null && quarter) {
    candidateKeys.push(buildFolderKey(grade, quarter, category));
  }
  candidateKeys.push("root");

  let folderId: string | null = null;
  let folderKeyUsed: string | null = null;
  for (const key of candidateKeys) {
    const [folder] = await db
      .select({ driveId: driveFolders.driveId })
      .from(driveFolders)
      .where(
        and(
          eq(driveFolders.folderKey, key),
          or(eq(driveFolders.ownerEmail, ownerEmail), isNull(driveFolders.ownerEmail))
        )
      )
      .limit(1);
    if (folder) {
      folderId = folder.driveId;
      folderKeyUsed = key;
      break;
    }
  }

  // ── Create the Drive file (the one and only Drive write) ───
  let driveFile;
  try {
    driveFile = spec
      ? // Spec-backed drafts carry their own styling — background, fonts,
        // colours, frozen headers — so they go through the spec executors.
        // The text path below stays for drafts already in flight.
        await createFromSpec(accessToken, spec, folderId ?? undefined)
      : format === "sheet"
        ? await createSheet(accessToken, title, tsvToCsv(content), folderId ?? undefined)
        : format === "slides"
          ? await createSlides(accessToken, title, slideOutline, folderId ?? undefined)
          : await createDoc(accessToken, title, content, folderId ?? undefined);
  } catch (err) {
    console.error(`[accept-draft] Drive ${format} creation failed:`, err);
    // This route was returning bare 502s, so the Slides object-ID bug produced
    // nothing in error_events and had to be dug out of Vercel logs by hand —
    // exactly the workflow that table exists to replace. `googleReason` carries
    // Google's own sentence, which is what actually names the fault.
    return refuse({
      route: ROUTE,
      status: 502,
      reason: "drive_create_failed",
      message: `Couldn't create the ${FORMAT_LABEL[format]}. The draft is still here — try again, or copy it out.`,
      ownerEmail,
      conversationId: body.conversationId ?? null,
      detail: {
        format,
        titleChars: title.length,
        contentChars: content.length,
        slideCount: format === "slides" ? slideOutline.length : 0,
        // Structured facts only — never Google's sentence, which embeds her
        // document titles and file ids. The full message still reaches the
        // Vercel console via the console.error above.
        ...googleErrorFacts(err),
      },
      asJson: true,
    });
  }
  if (!driveFile.id) {
    return refuse({
      route: ROUTE,
      status: 502,
      reason: "drive_no_file_id",
      message: "Drive didn't return a file. Try again in a moment.",
      ownerEmail,
      conversationId: body.conversationId ?? null,
      detail: { format },
      asJson: true,
    });
  }

  // ── Insert the material row (source: "ai" — provenance matters) ───
  const [material] = await db
    .insert(materials)
    .values({
      title,
      materialType,
      storageType: "google_drive",
      driveFileId: driveFile.id,
      driveMimeType: FORMAT_MIME[format],
      driveWebUrl: driveFile.webViewLink ?? null,
      driveFolderId: folderId,
      description: `AI-generated ${materialType} draft accepted from a Copilot session.`,
      source: "ai",
      // #537/#554: every materials insert path stamps ownership.
      ownerEmail,
    })
    .returning({ id: materials.id });

  // ── Optional attachment ───
  let attached: { type: string; id: string; title: string } | null = null;
  if (attachTo) {
    try {
      await db.insert(materialAttachments).values({
        materialId: material.id,
        attachableType: attachTo.type,
        attachableId: attachTo.id,
        role: "supporting",
      });
      attached = { type: attachTo.type, id: attachTo.id, title: attachTo.title };
      try {
        await logEdit({
          courseId: attachTo.courseId,
          action: "attach_material",
          entityType: "material",
          entityId: material.id,
          previousValue: null,
          newValue: {
            attachableType: attachTo.type,
            attachableId: attachTo.id,
            role: "supporting",
            via: "copilot_accept_draft",
          },
        });
      } catch (err) {
        console.error("[accept-draft] logEdit failed:", err);
      }
    } catch (err) {
      // Attachment failure must not undo the created doc/material — surface
      // partial success instead.
      console.error("[accept-draft] attachment failed:", err);
    }
  }

  // ── Analytics: mark the conversation as having produced a used artifact ───
  if (body.conversationId) {
    try {
      await db
        .update(copilotConversations)
        .set({ outcome: "used", updatedAt: new Date() })
        .where(
          and(
            eq(copilotConversations.id, body.conversationId),
            eq(copilotConversations.ownerEmail, ownerEmail)
          )
        );
    } catch (err) {
      console.error("[accept-draft] conversation outcome update failed:", err);
    }
  }

  return Response.json({
    materialId: material.id,
    driveFileId: driveFile.id,
    driveWebUrl: driveFile.webViewLink ?? null,
    folderKey: folderKeyUsed,
    attached,
  });
}
