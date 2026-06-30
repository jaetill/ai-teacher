// GET /api/drive/import?folderId=...
// Lists files in a shared Drive folder (for preview/classification).
//
// POST /api/drive/import
// Copies files from a shared folder into the AI Teacher Drive structure.
// Body: { sourceFolderId, files: [{ name, category, materialType, grade, destination }] }

import { getServerSession } from "next-auth";
import { google } from "googleapis";
import { authOptions } from "@/lib/auth";
import { getAccessToken } from "@/lib/auth-helpers";
import { db } from "@/db";
import { driveFolders, materials } from "@/db/schema";
import { and, eq, isNull, or } from "drizzle-orm";
import { buildFolderKey } from "@/lib/upload-utils";
import { escapeDriveQueryValue } from "@/lib/drive";

function getDriveClient(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.drive({ version: "v3", auth });
}

export async function GET(req: Request) {
  const accessToken = await getAccessToken(req);
  if (!accessToken) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const folderId = url.searchParams.get("folderId");
  if (!folderId) {
    return Response.json({ error: "folderId required" }, { status: 400 });
  }

  const drive = getDriveClient(accessToken);

  // List all files in the shared folder (recursive into subfolders)
  const allFiles: Array<{ id: string; name: string; mimeType: string; parents: string[] }> = [];

  async function listFolder(parentId: string) {
    let pageToken: string | undefined;
    do {
      const res = await drive.files.list({
        q: `'${escapeDriveQueryValue(parentId)}' in parents and trashed = false`,
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
    // Log the upstream Drive error server-side, but return a generic message —
    // err.message can leak Drive API internals / folder details to the client (#542).
    console.error("Drive import scan failed:", message);
    return Response.json(
      { error: "Failed to scan folder" },
      { status: 500 }
    );
  }

  return Response.json({ files: allFiles, count: allFiles.length });
}

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

  // Bound the array: each file triggers Drive API calls + a DB insert in the
  // loop below, so an unbounded files[] is an authenticated resource-exhaustion
  // vector (#536).
  if (!Array.isArray(body.files) || body.files.length === 0) {
    return Response.json({ error: "files is required" }, { status: 400 });
  }
  const MAX_FILES = 200;
  if (body.files.length > MAX_FILES) {
    return Response.json(
      { error: `Too many files (max ${MAX_FILES})` },
      { status: 400 }
    );
  }

  const drive = getDriveClient(accessToken);
  const results: Array<{ name: string; status: string; driveWebUrl?: string; message?: string }> = [];

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
        .where(
          and(
            eq(driveFolders.folderKey, folderKey),
            or(eq(driveFolders.ownerEmail, ownerEmail), isNull(driveFolders.ownerEmail)),
          )
        )
        .limit(1);

      if (!folder) {
        results.push({ name: file.name, status: "error", message: "Destination folder not found" });
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
        ownerEmail,
        source: "human",
      });

      results.push({
        name: file.name,
        status: "copied",
        driveWebUrl: copied.data.webViewLink!,
      });
    } catch (err) {
      console.error("Drive copy failed:", err);
      results.push({ name: file.name, status: "error", message: "Failed to copy file" });
    }
  }

  const copied = results.filter((r) => r.status === "copied").length;
  const errors = results.filter((r) => r.status.startsWith("error")).length;

  return Response.json({
    message: `Copied ${copied} files${errors > 0 ? `, ${errors} errors` : ""}`,
    results,
  });
}
