// POST /api/upload/check-duplicates
// Auth: requires Google OAuth session
// Checks which files already exist in the target Drive folders or materials DB.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { driveFolders, materials } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { listFilesInFolder } from "@/lib/drive";
import { buildFolderKey } from "@/lib/upload-utils";

type FileInput = {
  name: string;
  grade: number;
  destination: string;
  category: string;
};

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { files } = (await req.json()) as { files: FileInput[] };

  // ── Build unique folder keys and look them up ───
  const folderKeyMap = new Map<string, string>(); // folderKey → driveId
  const fileFolderKeys = files.map((f) =>
    f.destination === "YearPlan"
      ? buildFolderKey(f.grade, "YearPlan")
      : buildFolderKey(f.grade, f.destination, f.category)
  );
  const uniqueKeys = [...new Set(fileFolderKeys)];

  const folderRows = await db
    .select({ folderKey: driveFolders.folderKey, driveId: driveFolders.driveId })
    .from(driveFolders)
    .where(inArray(driveFolders.folderKey, uniqueKeys));

  for (const row of folderRows) {
    folderKeyMap.set(row.folderKey, row.driveId);
  }

  // ── List existing files in each Drive folder ───
  const driveFilesByFolder = new Map<string, Set<string>>(); // driveId → Set of filenames
  for (const driveId of new Set(folderKeyMap.values())) {
    const existing = await listFilesInFolder(session.accessToken, driveId);
    driveFilesByFolder.set(
      driveId,
      new Set(existing.map((f) => f.name?.toLowerCase() ?? ""))
    );
  }

  // ── Check materials DB ───
  const driveIds = [...new Set(folderKeyMap.values())];
  const dbMaterials = driveIds.length
    ? await db
        .select({ title: materials.title, driveFolderId: materials.driveFolderId })
        .from(materials)
        .where(inArray(materials.driveFolderId, driveIds))
    : [];
  const dbMaterialsByFolder = new Map<string, Set<string>>();
  for (const m of dbMaterials) {
    if (!m.driveFolderId) continue;
    if (!dbMaterialsByFolder.has(m.driveFolderId)) {
      dbMaterialsByFolder.set(m.driveFolderId, new Set());
    }
    dbMaterialsByFolder.get(m.driveFolderId)!.add(m.title.toLowerCase());
  }

  // ── Check each file ───
  const results = files.map((f, i) => {
    const folderKey = fileFolderKeys[i];
    const driveId = folderKeyMap.get(folderKey);
    if (!driveId) {
      return { name: f.name, isDuplicate: false };
    }

    const nameLower = f.name.toLowerCase();
    const driveFiles = driveFilesByFolder.get(driveId);
    if (driveFiles?.has(nameLower)) {
      return { name: f.name, isDuplicate: true, reason: "Exists in Drive folder" };
    }

    const dbFiles = dbMaterialsByFolder.get(driveId);
    if (dbFiles?.has(nameLower)) {
      return { name: f.name, isDuplicate: true, reason: "Exists in database" };
    }

    return { name: f.name, isDuplicate: false };
  });

  return Response.json({ results });
}
