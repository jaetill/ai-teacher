// GET /api/drive/import?folderId=...
// Lists files in a shared Drive folder (for preview/classification).
//
// POST /api/drive/import
// Copies files from a shared folder into the AI Teacher Drive structure.
// Body: { sourceFolderId, files: [{ name, category, materialType, grade, destination }] }

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { driveFolders, materials } from "@/db/schema";
import { eq } from "drizzle-orm";
import { buildFolderKey, getMimeType } from "@/lib/upload-utils";

function getDriveClient(accessToken: string) {
  const { google } = require("googleapis");
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.drive({ version: "v3", auth });
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const folderId = url.searchParams.get("folderId");
  if (!folderId) {
    return Response.json({ error: "folderId required" }, { status: 400 });
  }

  const drive = getDriveClient(session.accessToken);

  // List all files in the shared folder (recursive into subfolders)
  const allFiles: Array<{ id: string; name: string; mimeType: string; parents: string[] }> = [];

  async function listFolder(parentId: string) {
    let pageToken: string | undefined;
    do {
      const res = await drive.files.list({
        q: `'${parentId}' in parents and trashed = false`,
        fields: "nextPageToken, files(id, name, mimeType, parents)",
        pageSize: 200,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      for (const file of res.data.files ?? []) {
        if (file.mimeType === "application/vnd.google-apps.folder") {
          await listFolder(file.id!);
        } else {
          allFiles.push({
            id: file.id!,
            name: file.name!,
            mimeType: file.mimeType!,
            parents: file.parents ?? [],
          });
        }
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
  }

  try {
    await listFolder(folderId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Drive import scan failed:", message);
    return Response.json(
      { error: `Failed to scan folder: ${message}` },
      { status: 500 }
    );
  }

  return Response.json({ files: allFiles, count: allFiles.length });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json()) as {
    sourceFolderId: string;
    files: Array<{
      sourceFileId: string;
      name: string;
      category: string;
      materialType: string;
      grade: number;
      destination: string;
    }>;
  };

  const drive = getDriveClient(session.accessToken);
  const results: Array<{ name: string; status: string; driveWebUrl?: string }> = [];

  for (const file of body.files) {
    try {
      // Look up target folder
      const folderKey =
        file.destination === "YearPlan"
          ? buildFolderKey(file.grade, "YearPlan")
          : buildFolderKey(file.grade, file.destination, file.category);

      const [folder] = await db
        .select({ driveId: driveFolders.driveId })
        .from(driveFolders)
        .where(eq(driveFolders.folderKey, folderKey))
        .limit(1);

      if (!folder) {
        results.push({ name: file.name, status: "error: folder not found" });
        continue;
      }

      // Copy file to our folder structure
      const copied = await drive.files.copy({
        fileId: file.sourceFileId,
        requestBody: {
          name: file.name,
          parents: [folder.driveId],
        },
        fields: "id, name, mimeType, webViewLink",
      });

      // Save to materials DB
      await db.insert(materials).values({
        title: file.name,
        materialType: file.materialType || "other",
        storageType: "google_drive",
        driveFileId: copied.data.id!,
        driveMimeType: copied.data.mimeType!,
        driveWebUrl: copied.data.webViewLink!,
        driveFolderId: folder.driveId,
        source: "human",
      });

      results.push({
        name: file.name,
        status: "copied",
        driveWebUrl: copied.data.webViewLink!,
      });
    } catch (err) {
      results.push({
        name: file.name,
        status: `error: ${err instanceof Error ? err.message : "unknown"}`,
      });
    }
  }

  const copied = results.filter((r) => r.status === "copied").length;
  const errors = results.filter((r) => r.status.startsWith("error")).length;

  return Response.json({
    message: `Copied ${copied} files${errors > 0 ? `, ${errors} errors` : ""}`,
    results,
  });
}
