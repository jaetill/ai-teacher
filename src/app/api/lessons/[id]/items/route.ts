// POST /api/lessons/[id]/items — write assessment items FROM a passage (#679).
//
// The passage comes either from a material already attached to this lesson (no
// pasting tax — the app has her Drive files) or pasted directly. Either way it
// is the model's only permitted source, and every returned item carries a quote
// from it that we verify server-side before responding. Items whose evidence
// isn't in the passage are dropped and reported, not quietly kept.
//
// Nothing is persisted. This produces text she copies into Google Docs or
// Classroom; making it a stored entity can come later if she wants to keep them.
//
// Body: { materialId?, passage?, types[], count, format }

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAccessToken } from "@/lib/auth-helpers";
import { db } from "@/db";
import { lessons, units, courses, materials, materialAttachments } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getAnthropic } from "@/lib/anthropic";
import { checkAiRateLimit } from "@/lib/rate-limit";
import { MODELS } from "@/lib/models";
import { parseAiJson } from "@/lib/parse-ai-json";
import { isUuid, readJson } from "@/lib/api-utils";
import { ownedMaterials } from "@/lib/material-scope";
import { fetchDriveText, isExtractable } from "@/lib/drive-text";
import {
  buildItemPrompt,
  validateItems,
  balanceAnswerPositions,
  formatItemsAsPlainText,
  isItemType,
  MIN_PASSAGE,
  MAX_PASSAGE,
  MAX_ITEMS,
  type ItemFormat,
  type ItemType,
} from "@/lib/items";
import { apiError, logErrorEvent } from "@/lib/error-log";

const ROUTE = "/api/lessons/[id]/items";

export const maxDuration = 60;

type Body = {
  materialId?: string;
  passage?: string;
  types?: unknown;
  count?: number;
  format?: string;
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const ownerEmail = session?.user?.email;
  if (!ownerEmail) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  if (!isUuid(id)) {
    return Response.json({ error: "Invalid lesson id" }, { status: 400 });
  }

  const body = await readJson<Body>(req);
  if (!body) return Response.json({ error: "Invalid JSON body" }, { status: 400 });

  const types = (Array.isArray(body.types) ? body.types : []).filter(isItemType) as ItemType[];
  if (types.length === 0) {
    return Response.json({ error: "Pick at least one question type" }, { status: 400 });
  }
  const count = Math.min(Math.max(Math.trunc(body.count ?? 5), 1), MAX_ITEMS);
  const format: ItemFormat = body.format === "short_answer" ? "short_answer" : "multiple_choice";
  if (body.materialId !== undefined && !isUuid(body.materialId)) {
    return Response.json({ error: "Invalid materialId" }, { status: 400 });
  }

  // Owner-scoped: lesson → unit → course.ownerEmail.
  const [row] = await db
    .select({ grade: courses.grade, lessonTitle: lessons.title })
    .from(lessons)
    .innerJoin(units, eq(lessons.unitId, units.id))
    .innerJoin(courses, eq(units.courseId, courses.id))
    .where(and(eq(lessons.id, id), eq(courses.ownerEmail, ownerEmail)))
    .limit(1);
  if (!row) return Response.json({ error: "Lesson not found" }, { status: 404 });

  // ── Resolve the passage ────────────────────────────────────────────────
  let passage = (body.passage ?? "").trim();
  let sourceTitle: string | null = null;

  if (body.materialId) {
    // The material must be attached to THIS lesson and owned by the caller —
    // the lesson id alone must not become a way to read arbitrary materials.
    const [mat] = await db
      .select({
        id: materials.id,
        title: materials.title,
        driveFileId: materials.driveFileId,
        driveMimeType: materials.driveMimeType,
        inlineContent: materials.inlineContent,
      })
      .from(materials)
      .innerJoin(materialAttachments, eq(materialAttachments.materialId, materials.id))
      .where(
        and(
          eq(materials.id, body.materialId),
          eq(materialAttachments.attachableType, "lesson"),
          eq(materialAttachments.attachableId, id),
          ownedMaterials(ownerEmail),
        ),
      )
      .limit(1);
    if (!mat) {
      return Response.json({ error: "Material not attached to this lesson" }, { status: 404 });
    }
    sourceTitle = mat.title;

    if (mat.inlineContent && mat.inlineContent.trim()) {
      passage = mat.inlineContent.trim();
    } else if (mat.driveFileId) {
      if (!isExtractable(mat.driveMimeType)) {
        return Response.json(
          {
            error: `"${mat.title}" isn't a file we can read as text (PDFs, slides and images can't be). Paste the passage instead.`,
          },
          { status: 422 },
        );
      }
      const accessToken = await getAccessToken(req);
      if (!accessToken) {
        return Response.json(
          { error: "Google access has expired — sign out and back in, then try again." },
          { status: 401 },
        );
      }
      try {
        const text = await fetchDriveText(accessToken, mat.driveFileId, mat.driveMimeType);
        passage = (text ?? "").trim();
      } catch (err) {
        // Title goes to the user (it's hers); the logged message stays generic
        // because error_events must not carry filenames.
        await logErrorEvent({
          route: ROUTE,
          status: 502,
          reason: "upstream_failed",
          message: "Couldn't read a material from Drive.",
          cause: err,
        });
        return Response.json(
          { error: `Couldn't read "${mat.title}" from Drive. Paste the passage instead.` },
          { status: 502 },
        );
      }
    }
  }

  if (passage.length < MIN_PASSAGE) {
    return Response.json(
      {
        error:
          passage.length === 0
            ? "No passage — pick a material or paste the text to build questions from."
            : `That passage is too short to build questions from (needs about ${MIN_PASSAGE} characters).`,
      },
      { status: 400 },
    );
  }

  // Long files get trimmed rather than rejected; she can paste a narrower span
  // when she wants a specific scene.
  let truncated = false;
  if (passage.length > MAX_PASSAGE) {
    passage = passage.slice(0, MAX_PASSAGE);
    truncated = true;
  }

  const rateLimited = await checkAiRateLimit(ownerEmail);
  if (rateLimited) return rateLimited;

  const { system, user } = buildItemPrompt({
    passage,
    types,
    count,
    format,
    grade: row.grade,
    sourceTitle,
  });

  let parsed: unknown = null;
  try {
    const message = await getAnthropic().messages.create({
      model: MODELS.structured,
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: user }],
    });
    const text = message.content.map((c) => (c.type === "text" ? c.text : "")).join("");
    parsed = parseAiJson<unknown>(text);
  } catch (err) {
    return apiError(ROUTE, 502, "upstream_failed", "Couldn't write questions just now. Try again in a moment.", {
      cause: err,
    });
  }

  // The grounding gate. Anything whose evidence isn't in the passage dies here.
  const { kept, dropped } = validateItems(parsed, passage);
  const items = balanceAnswerPositions(kept);

  if (items.length === 0) {
    return Response.json(
      {
        error:
          "Nothing came back that was actually supported by the passage. Try a longer passage, or a different question type.",
        dropped,
      },
      { status: 422 },
    );
  }

  return Response.json({
    items,
    dropped,
    truncated,
    sourceTitle,
    plainText: formatItemsAsPlainText(items, {
      title: `${row.lessonTitle}${sourceTitle ? ` — ${sourceTitle}` : ""}`,
    }),
    studentText: formatItemsAsPlainText(items, {
      title: `${row.lessonTitle}${sourceTitle ? ` — ${sourceTitle}` : ""}`,
      includeKey: false,
    }),
  });
}
