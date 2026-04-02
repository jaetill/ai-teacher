// POST /api/upload/file
// Auth: requires Google OAuth session
// Uploads a single file to the correct Drive folder and saves metadata to materials DB.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { driveFolders, materials } from "@/db/schema";
import { eq } from "drizzle-orm";
import { uploadFile } from "@/lib/drive";
import { buildFolderKey, getMimeType } from "@/lib/upload-utils";
import { Readable } from "stream";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const name = formData.get("name") as string;
  const category = formData.get("category") as string;
  const materialType = formData.get("materialType") as string;
  const grade = parseInt(formData.get("grade") as string, 10);
  const destination = formData.get("destination") as string;

  if (!file || !name || !grade || !destination) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  // ── Look up target folder ───
  const folderKey =
    destination === "YearPlan"
      ? buildFolderKey(grade, "YearPlan")
      : buildFolderKey(grade, destination, category);

  const [folder] = await db
    .select({ driveId: driveFolders.driveId })
    .from(driveFolders)
    .where(eq(driveFolders.folderKey, folderKey))
    .limit(1);

  if (!folder) {
    return Response.json(
      { error: `Drive folder not found for key: ${folderKey}` },
      { status: 404 }
    );
  }

  // ── Upload to Drive ───
  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = getMimeType(name);
  const readable = Readable.from(buffer);

  const driveFile = await uploadFile(
    session.accessToken,
    name,
    readable,
    mimeType,
    folder.driveId
  );

  // ── Save to materials DB ───
  const [material] = await db
    .insert(materials)
    .values({
      title: name,
      materialType: materialType || "other",
      storageType: "google_drive",
      driveFileId: driveFile.id!,
      driveMimeType: driveFile.mimeType!,
      driveWebUrl: driveFile.webViewLink!,
      driveFolderId: folder.driveId,
      source: "human",
    })
    .returning({ id: materials.id });

  return Response.json({
    materialId: material.id,
    driveFileId: driveFile.id,
    driveWebUrl: driveFile.webViewLink,
  });
}
