// POST /api/import/backfill-units
// Body: { sourceFolderId }
//
// Non-destructive retrofit for material imported before unit capture existed.
// Re-scans the teacher's ORIGINAL source Drive folder, maps each filename to the
// subfolder (unit) it lives in, and fills `source_unit` on the owner's already-
// imported materials wherever it is currently NULL. It NEVER overwrites a non-null
// value, NEVER deletes, and NEVER re-copies a file — the worst case is that some
// material stays null (and keeps working via the build's fallback path).

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAccessToken } from "@/lib/auth-helpers";
import { db } from "@/db";
import { materials, driveFolders } from "@/db/schema";
import { and, eq, isNull, or, inArray } from "drizzle-orm";
import { scanFolderUnits } from "@/lib/drive";
import { readJson } from "@/lib/api-utils";

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

  const body = await readJson<{ sourceFolderId: string }>(req);
  if (!body?.sourceFolderId) {
    return Response.json({ error: "sourceFolderId required" }, { status: 400 });
  }

  // 1. Re-scan the source folder → build a title → unit map. A filename that
  //    appears in two different unit folders is ambiguous and is skipped rather
  //    than guessed.
  let scanned;
  try {
    scanned = await scanFolderUnits(accessToken, body.sourceFolderId);
  } catch (err) {
    console.error("Backfill scan failed:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Failed to scan folder" }, { status: 500 });
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

  // 2. The owner's imported materials that still lack a unit. `materials` has no
  //    owner column, so ownership is scoped through the destination folder's
  //    ownerEmail (legacy null-owner rows included), matching the import route.
  const ownerFolders = await db
    .select({ driveId: driveFolders.driveId })
    .from(driveFolders)
    .where(or(eq(driveFolders.ownerEmail, ownerEmail), isNull(driveFolders.ownerEmail)));
  const ownerDriveIds = ownerFolders.map((f) => f.driveId);
  if (ownerDriveIds.length === 0) {
    return Response.json({ matched: 0, skipped: 0, units: 0 });
  }
  const candidates = await db
    .select({ id: materials.id, title: materials.title })
    .from(materials)
    .where(and(isNull(materials.sourceUnit), inArray(materials.driveFolderId, ownerDriveIds)));

  // 3. Match by filename; collect updates for unambiguous hits only.
  const updates: Array<{ id: string; unit: string }> = [];
  let skipped = 0;
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
    updates.push({ id: m.id, unit });
  }

  // 4. Apply. The `isNull` guard in each WHERE keeps this idempotent and ensures
  //    a concurrent write can never be clobbered — only genuine nulls are filled.
  for (const u of updates) {
    await db
      .update(materials)
      .set({ sourceUnit: u.unit })
      .where(and(eq(materials.id, u.id), isNull(materials.sourceUnit)));
  }

  return Response.json({
    matched: updates.length,
    skipped,
    units: new Set(updates.map((u) => u.unit)).size,
  });
}
