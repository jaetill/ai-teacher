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
import { eq } from "drizzle-orm";

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
  for (const f of folders) {
    const existing = await db
      .select({ id: driveFolders.id })
      .from(driveFolders)
      .where(eq(driveFolders.folderKey, f.key))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(driveFolders)
        .set({ driveId: f.driveId, name: f.name, parentKey: f.parentKey, updatedAt: new Date() })
        .where(eq(driveFolders.folderKey, f.key));
    } else {
      await db.insert(driveFolders).values({
        folderKey: f.key,
        driveId: f.driveId,
        name: f.name,
        parentKey: f.parentKey,
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
