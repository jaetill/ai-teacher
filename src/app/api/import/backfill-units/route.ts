// POST /api/import/backfill-units
// Body: { sourceFolderId, repair?: boolean, grade?: number }
//
// Re-scans the teacher's ORIGINAL source Drive folder, maps each filename to the
// folder (unit) it lives in, and writes `source_unit` onto her already-imported
// materials. NEVER deletes and NEVER re-copies a file.
//
// Two modes:
//
//   default (repair omitted/false) — the original retrofit. Fills `source_unit`
//   only where it is currently NULL, never overwrites a value. Safe to run at
//   any time; worst case a material stays null and keeps working via the
//   build's fallback path.
//
//   repair: true — ALSO corrects rows whose stored unit disagrees with a fresh
//   scan. Added because a scanner bug (#682) wrote the DEEPEST folder name
//   instead of the first folder below the scanned root, so 123 of Heidi's 168
//   Grade 6 materials carried units like "Letters" (a subfolder of Dash Q3) and
//   "Character Analysis - G6" rather than Dash and Before the Ever After. Those
//   values are wrong, not missing, so the null-only path could not touch them —
//   and the alternative was re-importing 168 files, which would duplicate every
//   material row and every copied Drive file.
//
// `grade` scopes the write to one grade's folders. Matching is by FILENAME, and
// the scan map only contains names from the folder being scanned, so without a
// scope a same-named file in another grade could be reassigned. Pass it when
// repairing a single grade.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAccessToken } from "@/lib/auth-helpers";
import { db } from "@/db";
import { materials, driveFolders } from "@/db/schema";
import { and, eq, isNull, or, inArray, like } from "drizzle-orm";
import { scanFolderUnits } from "@/lib/drive";
import { readJson } from "@/lib/api-utils";
import { ownedMaterials } from "@/lib/material-scope";
import { apiError } from "@/lib/error-log";

const ROUTE = "/api/import/backfill-units";

export async function POST(req: Request) {
  const accessToken = await getAccessToken(req);
  if (!accessToken) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const session = await getServerSession(authOptions);
  const ownerEmail = session?.user?.email;
  if (!ownerEmail) {
    return Response.json({ error: "Session missing email" }, { status: 401 });
  }

  const body = await readJson<{
    sourceFolderId: string;
    repair?: boolean;
    grade?: number;
  }>(req);
  if (!body?.sourceFolderId) {
    return Response.json({ error: "sourceFolderId required" }, { status: 400 });
  }
  const repair = body.repair === true;

  // Grade is interpolated into a LIKE pattern, so it must be a plain integer.
  if (body.grade !== undefined) {
    if (!Number.isInteger(body.grade) || body.grade < 1 || body.grade > 12) {
      return Response.json({ error: "grade must be an integer 1-12" }, { status: 400 });
    }
  }
  const grade = body.grade;

  // 1. Re-scan the source folder → build a title → unit map. A filename that
  //    appears in two different unit folders is ambiguous and is skipped rather
  //    than guessed.
  let scanned;
  try {
    scanned = await scanFolderUnits(accessToken, body.sourceFolderId);
  } catch (err) {
    return apiError(ROUTE, 502, "upstream_failed", "Failed to scan folder", { cause: err, ownerEmail });
  }
  const unitByTitle = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const f of scanned) {
    if (!f.sourceUnit) continue; // files at the root carry no unit
    const key = f.name.toLowerCase();
    const existing = unitByTitle.get(key);
    if (existing !== undefined && existing !== f.sourceUnit) {
      ambiguous.add(key);
    } else {
      unitByTitle.set(key, f.sourceUnit);
    }
  }

  // 2. The owner's imported materials. Ownership is scoped through the
  //    destination folder's ownerEmail (legacy null-owner rows included),
  //    matching the import route; `grade` narrows it further when supplied.
  const ownerFolders = await db
    .select({ driveId: driveFolders.driveId })
    .from(driveFolders)
    .where(
      and(
        or(eq(driveFolders.ownerEmail, ownerEmail), isNull(driveFolders.ownerEmail)),
        grade !== undefined ? like(driveFolders.folderKey, `grade_${grade}_%`) : undefined,
      ),
    );
  const ownerDriveIds = ownerFolders.map((f) => f.driveId);
  if (ownerDriveIds.length === 0) {
    return Response.json({ matched: 0, skipped: 0, units: 0, repaired: [] });
  }
  const candidates = await db
    .select({ id: materials.id, title: materials.title, sourceUnit: materials.sourceUnit })
    .from(materials)
    .where(
      and(
        // Default mode only ever looks at nulls; repair mode considers every row.
        repair ? undefined : isNull(materials.sourceUnit),
        inArray(materials.driveFolderId, ownerDriveIds),
        ownedMaterials(ownerEmail),
      ),
    );

  // 3. Match by filename. Fills are rows going NULL → unit; repairs are rows
  //    whose stored unit disagrees with the scan (repair mode only).
  const fills: Array<{ id: string; unit: string }> = [];
  const repairs: Array<{ id: string; title: string; from: string; to: string }> = [];
  let skipped = 0;
  let alreadyCorrect = 0;
  for (const m of candidates) {
    const key = m.title.toLowerCase();
    if (ambiguous.has(key)) {
      skipped++;
      continue;
    }
    const unit = unitByTitle.get(key);
    if (!unit) {
      skipped++;
      continue;
    }
    // Normalise: a column that was never selected reads undefined, a NULL
    // column reads null, and both mean "no unit recorded".
    const stored = m.sourceUnit ?? null;
    if (stored === null) {
      fills.push({ id: m.id, unit });
    } else if (stored === unit) {
      alreadyCorrect++;
    } else if (repair) {
      repairs.push({ id: m.id, title: m.title, from: stored, to: unit });
    } else {
      // Non-null and disagreeing, but repair was not requested — leave it.
      skipped++;
    }
  }

  // 4. Apply. Each WHERE re-asserts the value we read, so a concurrent write
  //    can never be clobbered: fills only touch rows still NULL, repairs only
  //    touch rows still holding the exact value we decided to replace.
  for (const f of fills) {
    await db
      .update(materials)
      .set({ sourceUnit: f.unit })
      .where(and(eq(materials.id, f.id), isNull(materials.sourceUnit)));
  }
  for (const r of repairs) {
    await db
      .update(materials)
      .set({ sourceUnit: r.to })
      .where(and(eq(materials.id, r.id), eq(materials.sourceUnit, r.from)));
  }

  return Response.json({
    // `matched` keeps its original meaning: rows that went NULL → unit.
    matched: fills.length,
    skipped,
    alreadyCorrect,
    units: new Set([...fills.map((f) => f.unit), ...repairs.map((r) => r.to)]).size,
    // Every corrected row, from → to, so a repair is auditable rather than
    // a number to be taken on trust.
    repaired: repairs.map((r) => ({ title: r.title, from: r.from, to: r.to })),
  });
}
