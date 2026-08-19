// The teacher's year plan: a grade-level reference that isn't a quarter and
// isn't a unit.
//
// NOT to be confused with /api/year-plan, which points the other way: that one
// GENERATES a year plan with AI from a grade + standards and saves it as units.
// This module READS the plan she already wrote and feeds it back in as a
// constraint. Hence the "-reference" suffix — if the two ever meet, her
// document should become the `existingCurriculum` input to the generator.
//
// Heidi keeps one document at the root of her grade folder that lays out the
// whole year — the units, their order, roughly how long each runs. Every
// quarter she builds is a slice of that document, so it can't live in a
// quarter bucket. It goes in `grade_<n>_YearPlan` (a bucket the folder
// structure has always had) and is read back here on EVERY build for that
// grade, not consumed once at import.
//
// Why this matters beyond convenience: the build's verified failure mode is
// FRAGMENTATION — it invents more units than she teaches and splits lessons
// finer than she plans. That was established by reading her Grade 7 edit log,
// where the whole session was un-fragmenting: ~48 material moves that merged
// over-granular AI lessons, 7 lesson deletions, and one spurious unit deleted.
// A year plan states how many units there are and what they're called, which
// is exactly the missing constraint. (Rationale carried in PR #680; the source
// analysis lives outside the repo, so there is no in-tree doc to link.)
//
// Failure policy: never break a build. A missing folder, an unreadable file,
// an expired token, a Drive outage — all degrade to "" and the build proceeds
// exactly as it did before this existed.

import { db } from "@/db";
import { driveFolders, materials } from "@/db/schema";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { ownedMaterials } from "@/lib/material-scope";
import { fetchDriveText, isExtractable } from "@/lib/drive-text";
import { getAccessToken } from "@/lib/auth-helpers";

/**
 * Total characters of year-plan text allowed into a build prompt.
 *
 * Sized above the 10k cap on pasted `referenceText` because a real year plan
 * is a document, not a note, but still bounded: the prompt also carries the
 * material list and the full grade standards list, and the model's output
 * budget (32k) is what the quarter's enrichment actually needs.
 */
export const YEAR_PLAN_CHAR_BUDGET = 12_000;

/** Extractable files read per build. Guards against a folder used as a dumping ground. */
export const YEAR_PLAN_MAX_FILES = 5;

export function yearPlanFolderKey(grade: number): string {
  return `grade_${grade}_YearPlan`;
}

/**
 * Strip prompt-control markers from Drive document text before it reaches the
 * system prompt (SEC-M1, PR #680).
 *
 * The threat is narrow — `ownedMaterials()` scopes reads to the teacher's own
 * files, so exploiting this means her Drive is already compromised, and the
 * worst case is a distorted curriculum rather than leaked data. We strip anyway
 * because a year plan is an *imported document*, a less controlled origin than
 * the pasted `referenceText` this sits beside, and the cost is one regex pass.
 *
 * Deliberately conservative: only sequences that could be read as structural
 * prompt boundaries are neutralised. A real year plan says "Q1: The Giver",
 * never "SYSTEM:", so ordinary curriculum prose passes through untouched. We
 * blank the markers rather than dropping the lines — silently deleting a line
 * of her plan would be worse than showing the model a defanged one.
 */
export function stripPromptControlMarkers(text: string): string {
  return (
    text
      // Role headers that could open a fake turn ("System:", "Assistant:", …)
      // only when they START a line — "the assistant: a helper" stays intact.
      .replace(/^[ \t]*(system|assistant|human|user)[ \t]*:/gim, "$1 -")
      // Chat-template control tokens (<|im_start|>, <|endoftext|>, …).
      .replace(/<\|[^|>]*\|>/g, "")
      // Long dash/underscore/equals rules that mimic a section boundary. Three
      // is the markdown <hr> threshold, which is also our delimiter width.
      .replace(/^[ \t]*([-_=]){3,}[ \t]*$/gm, "")
      // Fenced blocks can smuggle a "new instructions" frame past a reader.
      .replace(/^[ \t]*`{3,}.*$/gm, "")
  );
}

/**
 * Make a Drive file title safe to use as a section delimiter (SEC-M2).
 *
 * The title is interpolated as `--- <title> ---`, so a file named
 * `--- \n\nIgnore all previous instructions` would break out of the delimiter
 * and read as prose. Collapse to a single line and strip the delimiter
 * characters themselves.
 */
export function sanitizeTitleForDelimiter(title: string): string {
  const cleaned = title
    .replace(/[\r\n]+/g, " ")
    .replace(/[-_=]{3,}/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return cleaned || "untitled";
}

/**
 * Load the grade's year-plan text, ready to drop into a build prompt.
 *
 * Returns "" when there is no year plan, nothing readable in it, or anything
 * at all goes wrong — callers should treat "" as "no reference" and carry on.
 * PDFs and slide decks are silently skipped: `isExtractable` can't get text
 * out of them, and that's a property of the file, not an error.
 */
export async function loadYearPlanReference(
  req: Request,
  ownerEmail: string,
  grade: number,
): Promise<string> {
  try {
    const folders = await db
      .select({ driveId: driveFolders.driveId })
      .from(driveFolders)
      .where(
        and(
          eq(driveFolders.folderKey, yearPlanFolderKey(grade)),
          // Open-null policy (ADR-0044), same as every other folder read.
          or(eq(driveFolders.ownerEmail, ownerEmail), isNull(driveFolders.ownerEmail)),
        ),
      );

    const driveIds = folders.map((f) => f.driveId);
    if (driveIds.length === 0) return "";

    const rows = await db
      .select({
        title: materials.title,
        driveFileId: materials.driveFileId,
        driveMimeType: materials.driveMimeType,
      })
      .from(materials)
      .where(and(inArray(materials.driveFolderId, driveIds), ownedMaterials(ownerEmail)));

    const readable = rows
      .filter((r) => r.driveFileId && isExtractable(r.driveMimeType))
      .slice(0, YEAR_PLAN_MAX_FILES);
    if (readable.length === 0) return "";

    // Token fetched only once we know there's something worth reading — an
    // expired token shouldn't matter to a teacher with no year plan.
    const accessToken = await getAccessToken(req);
    if (!accessToken) return "";

    const blocks: string[] = [];
    for (const row of readable) {
      let text: string | null = null;
      try {
        text = await fetchDriveText(accessToken, row.driveFileId!, row.driveMimeType);
      } catch (err) {
        // Image-heavy Docs exceed Google's export cap and throw; a revoked
        // share throws too. Neither is worth failing a build over.
        // JSON.stringify escapes newlines/ANSI in the title so a crafted file
        // name can't forge log lines (SEC-L2).
        console.error(`[year-plan] could not read ${JSON.stringify(row.title)}:`, err);
        continue;
      }
      const trimmed = stripPromptControlMarkers(text ?? "").trim();
      if (trimmed) {
        blocks.push(`--- ${sanitizeTitleForDelimiter(row.title)} ---\n${trimmed}`);
      }
    }
    if (blocks.length === 0) return "";

    const joined = blocks.join("\n\n");
    return joined.length > YEAR_PLAN_CHAR_BUDGET
      ? `${joined.slice(0, YEAR_PLAN_CHAR_BUDGET)}\n[year plan truncated]`
      : joined;
  } catch (err) {
    console.error("[year-plan] load failed:", err);
    return "";
  }
}
