// POST /api/drive/setup
// Auth: requires Google OAuth session
// Creates the Drive folder structure for the AI Teacher app
// and persists folder IDs to the database.
// Returns: JSON with folder IDs for all created/found folders.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { findOrCreateFolder } from "@/lib/drive";
import { db } from "@/db";
import { driveFolders } from "@/db/schema";
import { and, eq, isNull, or } from "drizzle-orm";

const GRADES = [6, 7, 8];
const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];
const UNIT_SUBFOLDERS = ["Curriculum", "Lessons", "Activities", "Assessments", "Resources"];

type FolderEntry = { key: string; driveId: string; name: string; parentKey: string | null };

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const token = session.accessToken;
  // Require a real email: a null-email session must not fall through to the
  // isNull() branch below, which would let it read/overwrite legacy NULL-owner
  // folder rows and bypass the owner-scoping this PR establishes.
  const ownerEmail = session.user?.email;
  if (!ownerEmail) {
    return Response.json({ error: "Session missing email" }, { status: 401 });
  }

  const folders: FolderEntry[] = [];

  // ── Root folder ───
  const root = await findOrCreateFolder(token, "AI Teacher");
  folders.push({ key: "root", driveId: root.id, name: "AI Teacher", parentKey: null });

  // ── Standards folder ───
  const standards = await findOrCreateFolder(token, "Standards", root.id);
  folders.push({ key: "standards", driveId: standards.id, name: "Standards", parentKey: "root" });

  // ── Grade folders with year plan and quarters ───
  for (const grade of GRADES) {
    const gradeName = `Grade ${grade} English`;
    const gradeKey = `grade_${grade}`;
    const gradeFolder = await findOrCreateFolder(token, gradeName, root.id);
    folders.push({ key: gradeKey, driveId: gradeFolder.id, name: gradeName, parentKey: "root" });

    const yearPlan = await findOrCreateFolder(token, "Year Plan", gradeFolder.id);
    folders.push({ key: `${gradeKey}_YearPlan`, driveId: yearPlan.id, name: "Year Plan", parentKey: gradeKey });

    for (const quarter of QUARTERS) {
      const quarterKey = `${gradeKey}_${quarter}`;
      const quarterFolder = await findOrCreateFolder(token, quarter, gradeFolder.id);
      folders.push({ key: quarterKey, driveId: quarterFolder.id, name: quarter, parentKey: gradeKey });

      for (const sub of UNIT_SUBFOLDERS) {
        const subFolder = await findOrCreateFolder(token, sub, quarterFolder.id);
        folders.push({ key: `${quarterKey}_${sub}`, driveId: subFolder.id, name: sub, parentKey: quarterKey });
      }
    }
  }

  // ── Persist to database (upsert) ───
  // Open-null read policy (ADR-0044): match this owner's rows OR legacy NULL-owner
  // rows. ownerEmail is guaranteed non-null by the guard above.
  const ownerPredicate = or(
    eq(driveFolders.ownerEmail, ownerEmail),
    isNull(driveFolders.ownerEmail)
  );

  for (const f of folders) {
    const existing = await db
      .select({ id: driveFolders.id })
      .from(driveFolders)
      .where(and(eq(driveFolders.folderKey, f.key), ownerPredicate))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(driveFolders)
        .set({ driveId: f.driveId, name: f.name, parentKey: f.parentKey, ownerEmail, updatedAt: new Date() })
        .where(and(eq(driveFolders.folderKey, f.key), ownerPredicate));
    } else {
      await db.insert(driveFolders).values({
        folderKey: f.key,
        driveId: f.driveId,
        name: f.name,
        parentKey: f.parentKey,
        ownerEmail,
      });
    }
  }

  // Build response map
  const result: Record<string, string> = {};
  for (const f of folders) {
    result[f.key] = f.driveId;
  }

  return Response.json({
    message: "Drive folder structure created and saved to database",
    folders: result,
  });
}
