// GET  /api/materials/summarize — count of unsummarized Drive materials
//                                 (owner-scoped), broken down by mime kind.
// POST /api/materials/summarize — summarize ONE BATCH of unsummarized
//                                 materials (Drive content → Haiku → write
//                                 materials.description). Returns
//                                 { processed, skipped, remaining } so the
//                                 client loops until remaining is 0.
//
// Design notes:
// - Batched because Vercel route handlers have tight wall-clock limits;
//   each batch stays well under maxDuration.
// - Haiku, truncated input: summarizing a quiz into three sentences is
//   small-model work — the whole corpus costs well under a dollar.
// - Incremental by construction: only materials with an empty description
//   are selected, so re-runs only touch new files. (Future: the import flow
//   should enqueue this step automatically — tracked in #633 discussion.)
// - Extractable content v1: Google Docs (export), .docx (mammoth), plain
//   text. PDFs/slides/sheets are counted as skipped, description untouched.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAccessToken } from "@/lib/auth-helpers";
import { checkAiRateLimit } from "@/lib/rate-limit";
import { getAnthropic } from "@/lib/anthropic";
import { fetchDriveText, isExtractable } from "@/lib/drive-text";
import { MODELS } from "@/lib/models";
import { db } from "@/db";
import { courses, driveFolders, materials, units } from "@/db/schema";
import { ownedMaterials } from "@/lib/material-scope";
import { and, eq, inArray, isNull, or, sql as dsql } from "drizzle-orm";
import { recordAiUsage } from "@/lib/ai-usage";

export const maxDuration = 60;

const BATCH_SIZE = 5;
const MAX_CONTENT_CHARS = 12_000;
const SUMMARIZER_MODEL = MODELS.summarizer;
const ROUTE = "/api/materials/summarize";



// #644: titles and types come from Drive metadata, which the teacher (or a
// Drive share) controls — keep them inert inside the prompt: collapse to a
// single line and bound the length so a hostile filename can't smuggle
// multi-line instructions into the summarizer. (Not exported: Next route
// files only allow handler/config exports; tests exercise it via the prompt.)
function promptSafe(s: string, max = 160): string {
  return s.replace(/\s+/g, " ").trim().slice(0, max);
}

// Owner-scoped unsummarized Drive materials, via the same grade/quarter
// folder-key scoping the pool and copilot context use (materials have no
// owner column).
async function findUnsummarized(ownerEmail: string) {
  const ownCourses = await db
    .select({ id: courses.id, grade: courses.grade })
    .from(courses)
    .where(eq(courses.ownerEmail, ownerEmail));
  const courseIds = ownCourses.map((c) => c.id);
  const ownUnits = courseIds.length
    ? await db
        .select({ courseId: units.courseId, quarter: units.quarter })
        .from(units)
        .where(inArray(units.courseId, courseIds))
    : [];
  const CATEGORIES = ["Curriculum", "Lessons", "Activities", "Assessments", "Resources"];
  const folderKeys = ownCourses.flatMap((c) => {
    const qs = [...new Set(ownUnits.filter((u) => u.courseId === c.id).map((u) => u.quarter).filter(Boolean))];
    return qs.flatMap((q) => CATEGORIES.map((cat) => `grade_${c.grade}_${q}_${cat}`));
  });
  const folderIds = folderKeys.length
    ? (
        await db
          .select({ driveId: driveFolders.driveId })
          .from(driveFolders)
          .where(
            and(
              inArray(driveFolders.folderKey, folderKeys),
              or(eq(driveFolders.ownerEmail, ownerEmail), isNull(driveFolders.ownerEmail))
            )
          )
      ).map((f) => f.driveId)
    : [];
  if (folderIds.length === 0) return [];

  return db
    .select({
      id: materials.id,
      title: materials.title,
      materialType: materials.materialType,
      driveFileId: materials.driveFileId,
      driveMimeType: materials.driveMimeType,
    })
    .from(materials)
    .where(
      and(
        inArray(materials.driveFolderId, folderIds),
        eq(materials.storageType, "google_drive"),
        ownedMaterials(ownerEmail),
        or(isNull(materials.description), eq(materials.description, ""))
      )
    );
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const ownerEmail = session?.user?.email;
  if (!ownerEmail) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const rows = await findUnsummarized(ownerEmail);
  const extractable = rows.filter((r) => isExtractable(r.driveMimeType)).length;
  return Response.json({
    unsummarized: rows.length,
    extractable,
    unsupported: rows.length - extractable,
  });
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
  // #643: this route spends Anthropic tokens — draw from the same shared
  // per-user hourly AI budget as every other Anthropic-calling route. One
  // check per batch (a batch = up to BATCH_SIZE small Haiku calls).
  const rateLimited = await checkAiRateLimit(ownerEmail);
  if (rateLimited) return rateLimited;

  const rows = await findUnsummarized(ownerEmail);
  const extractable = rows.filter((r) => isExtractable(r.driveMimeType) && r.driveFileId);
  const batch = extractable.slice(0, BATCH_SIZE);

  let processed = 0;
  const failures: string[] = [];

  for (const m of batch) {
    try {
      const content = await fetchDriveText(accessToken, m.driveFileId!, m.driveMimeType);
      if (!content || content.trim().length === 0) {
        // Downloaded fine but no extractable text (blank doc, or image-based
        // content like a drawn timeline). Write an explicit marker so the
        // file is honestly labeled AND stops being re-selected forever —
        // without this, empty docs haunt the unsummarized count on every run.
        console.warn(`[summarize] no extractable text in "${m.title}" (${m.driveMimeType})`);
        await db
          .update(materials)
          .set({
            description: "[No extractable text — this file appears to be empty or image-based.]",
            updatedAt: new Date(),
          })
          .where(eq(materials.id, m.id));
        failures.push(m.title);
        processed++; // it was handled; count it as progress so the loop advances
        continue;
      }
      const truncated = content.slice(0, MAX_CONTENT_CHARS);
      const msg = await getAnthropic().messages.create({
        model: SUMMARIZER_MODEL,
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: `Summarize this teaching material in 2-3 plain sentences for an AI index. State what kind of document it is, what content it covers (texts, chapters, vocabulary words, skills), and notable components (word banks, rubric rows, question types and counts, answer keys). No preamble.\n\nTitle: ${promptSafe(m.title)}\nCategorized as: ${promptSafe(m.materialType, 40)}\n\n--- DOCUMENT (may be truncated) ---\n${truncated}`,
          },
        ],
      });
      await recordAiUsage({
        route: ROUTE,
        ownerEmail,
        model: SUMMARIZER_MODEL,
        usage: msg.usage,
        entityType: "material",
        entityId: m.id,
        action: "summarize",
      });
      const summary =
        msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
      if (!summary) {
        failures.push(m.title);
        continue;
      }
      await db
        .update(materials)
        .set({ description: summary, updatedAt: new Date() })
        .where(eq(materials.id, m.id));
      processed++;
    } catch (err) {
      console.error(`[summarize] failed for "${m.title}":`, err);
      failures.push(m.title);
      // Classify: auth, rate-limit, and server hiccups are retryable — leave
      // the row untouched so a later run picks it up. Everything else is a
      // permanent content failure (seen in the wild: Google refuses to export
      // image-heavy Docs over its export size cap), so write a marker; without
      // it the file is re-offered on every run and fails forever (#642's
      // sibling case — that fix only caught empty exports, not throwing ones).
      const e = err as { code?: number; status?: number; message?: string };
      const code = e?.code ?? e?.status ?? 0;
      const msg = String(e?.message ?? err);
      const retryable =
        code === 401 || code === 429 || code >= 500 || /invalid_grant|rate.?limit/i.test(msg);
      if (!retryable) {
        await db
          .update(materials)
          .set({
            description:
              "[Could not be summarized — the file could not be read as text (likely image-based or too large to export).]",
            updatedAt: new Date(),
          })
          .where(eq(materials.id, m.id));
        processed++; // handled: it will stop being offered
      }
    }
  }

  // Failed items still have empty descriptions and would be retried forever;
  // report remaining as what a NEXT batch could actually process.
  const remaining = Math.max(0, extractable.length - batch.length);
  const unsupported = rows.length - extractable.length;

  return Response.json({
    processed,
    failed: failures,
    remaining,
    unsupported,
    // Non-null count via cheap aggregate for the UI's running total.
    totalSummarized: Number(
      (
        await db
          .select({ n: dsql<number>`count(*)` })
          .from(materials)
          .where(and(eq(materials.storageType, "google_drive"), dsql`${materials.description} is not null and ${materials.description} != ''`))
      )[0]?.n ?? 0
    ),
  });
}
