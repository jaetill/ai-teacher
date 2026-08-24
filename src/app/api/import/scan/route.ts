// GET /api/import/scan?folderId=...   (or ?fileId=... for a single file)
//
// Reports the shape of what the teacher pointed at, plus a proposed reading of
// that shape. It writes nothing and interprets nothing on its own — the
// proposal is a starting point she corrects, and the correction is what the
// plan endpoint acts on.

import { getAccessToken } from "@/lib/auth-helpers";
import { scanTree, getDriveClient, type ScannedNode } from "@/lib/drive";
import { proposeLevelMap } from "@/lib/import-structure";

export const maxDuration = 60;

function countFiles(node: ScannedNode): number {
  return node.isFolder ? node.children.reduce((n, c) => n + countFiles(c), 0) : 1;
}

function countFolders(node: ScannedNode): number {
  return node.isFolder ? node.children.reduce((n, c) => n + countFolders(c), 1) : 0;
}

export async function GET(req: Request) {
  const accessToken = await getAccessToken(req);
  if (!accessToken) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const folderId = url.searchParams.get("folderId");
  const fileId = url.searchParams.get("fileId");
  if (!folderId && !fileId) {
    return Response.json({ error: "folderId or fileId required" }, { status: 400 });
  }

  try {
    if (fileId) {
      // A single file has no structure to read. Wrap it in a synthetic root so
      // the same level-map machinery applies, with the only map that can mean
      // anything here.
      const drive = getDriveClient(accessToken);
      const res = await drive.files.get({
        fileId,
        fields: "id, name, mimeType",
        supportsAllDrives: true,
      });
      const tree: ScannedNode = {
        id: `single:${res.data.id}`,
        name: res.data.name ?? "",
        mimeType: "application/vnd.google-apps.folder",
        isFolder: true,
        children: [
          {
            id: res.data.id!,
            name: res.data.name!,
            mimeType: res.data.mimeType!,
            isFolder: false,
            children: [],
          },
        ],
      };
      return Response.json({
        tree,
        proposal: {
          levels: ["container"],
          reason: "A single file — pick where it goes and it lands in the pool.",
          alternatives: [],
        },
        fileCount: 1,
        folderCount: 0,
      });
    }

    const tree = await scanTree(accessToken, folderId!);
    return Response.json({
      tree,
      proposal: proposeLevelMap(tree),
      fileCount: countFiles(tree),
      folderCount: countFolders(tree) - 1, // exclude the root itself
    });
  } catch (err) {
    // Log upstream Drive detail server-side but return a generic message —
    // err.message can leak Drive internals and folder names to the client (#542).
    console.error("import scan failed:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Failed to scan" }, { status: 500 });
  }
}
