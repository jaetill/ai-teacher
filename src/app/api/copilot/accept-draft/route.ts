// POST /api/copilot/accept-draft
// Auth: requires Google OAuth session (Drive access token).
//
// The explicit-consent half of the draft protocol (see src/lib/draft-protocol.ts
// and claude/assessment-builder-decisions-2026-07-30.md in the project docs):
// the copilot only ever PROPOSES drafts; nothing is written to the teacher's
// Drive until she clicks Accept & Create, which calls this route. It then:
//   1. creates a Google Doc from the draft text, placed in the app's own
//      grade/quarter/category folder (where lesson materials link from â€” NOT
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
import { createDoc, createSheet, createSlides } from "@/lib/drive";
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
};

const MAX_TITLE_CHARS = 200;
const MAX_CONTENT_CHARS = 100_000;

const ROUTE = "/api/copilot/accept-draft";

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
  const format = normalizeDraftFormat(body.format);

  // Reject a body that cannot become the file it claims to be, before any
  // Drive write â€” an empty deck or a one-column "spreadsheet" is a worse
  // outcome for her than being told the draft was malformed.
  if (format === "sheet" && !content.includes("\t")) {
    return Response.json(
      { error: "This draft is not tab-separated, so it cannot become a spreadsheet." },
      { status: 400 }
    );
  }
  const slideOutline = format === "slides" ? parseSlideOutline(content) : [];
  if (format === "slides" && slideOutline.length === 0) {
    return Response.json(
      { error: "This draft has no '# Slide title' headings, so it cannot become a deck." },
      { status: 400 }
    );
  }
  let grade = [6, 7, 8].includes(body.grade as number) ? (body.grade as number) : null;
  let quarter = normalizeQuarter(body.quarter);

  // â”€â”€ Resolve optional placement (lesson first, else unit) â”€â”€â”€
  // Titles come from the model, which saw the real titles in its curriculum
  // context â€” but resolution is best-effort: no match (or an out-of-owner
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

  // â”€â”€ Resolve destination Drive folder â”€â”€â”€
  // Preferred: the grade/quarter category folder (that's what the material
  // pool query is keyed on â€” see editor/pool/route.ts). Fallback: the app
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

  // â”€â”€ Create the Drive file (the one and only Drive write) â”€â”€â”€
  let driveFile;
  try {
    driveFile =
      format === "sheet"
        ? await createSheet(accessToken, title, tsvToCsv(content), folderId ?? undefined)
        : format === "slides"
          ? await createSlides(accessToken, title, slideOutline, folderId ?? undefined)
          : await createDoc(accessToken, title, content, folderId ?? undefined);
  } catch (err) {
    console.error(`[accept-draft] Drive ${format} creation failed:`, err);
    // This route was returning bare 502s, so the Slides object-ID bug produced
    // nothing in error_events and had to be dug out of Vercel logs by hand â€”
    // exactly the workflow that table exists to replace. `googleReason` carries
    // Google's own sentence, which is what actually names the fault.
    return refuse({
      route: ROUTE,
      status: 502,
      reason: "drive_create_failed",
      message: `Couldn't create the ${FORMAT_LABEL[format]}. The draft is still here â€” try again, or copy it out.`,
      ownerEmail,
      conversationId: body.conversationId ?? null,
      detail: {
        format,
        titleChars: title.length,
        contentChars: content.length,
        slideCount: format === "slides" ? slideOutline.length : 0,
        googleReason: err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300),
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

  // â”€â”€ Insert the material row (source: "ai" â€” provenance matters) â”€â”€â”€
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

  // â”€â”€ Optional attachment â”€â”€â”€
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
      // Attachment failure must not undo the created doc/material â€” surface
      // partial success instead.
      console.error("[accept-draft] attachment failed:", err);
    }
  }

  // â”€â”€ Analytics: mark the conversation as having produced a used artifact â”€â”€â”€
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
