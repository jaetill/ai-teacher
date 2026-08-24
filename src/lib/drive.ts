import { google } from "googleapis";
import type { Readable } from "stream";

export function getDriveClient(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.drive({ version: "v3", auth });
}

// Escape a value before embedding it in a Drive API query string literal
// (the `q` parameter). Per Google's query syntax, string literals are wrapped
// in single quotes and a backslash escapes both `\` and `'`. Without this, a
// name/id containing a single quote breaks the query or lets a caller inject
// additional query clauses. Escape backslash FIRST, then the single quote.
export function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// ── Folder operations ───

export async function createFolder(
  accessToken: string,
  name: string,
  parentId?: string
) {
  const drive = getDriveClient(accessToken);
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      ...(parentId ? { parents: [parentId] } : {}),
    },
    fields: "id, name, webViewLink",
  });
  return res.data;
}

export async function findOrCreateFolder(
  accessToken: string,
  name: string,
  parentId?: string
): Promise<{ id: string; name: string; webViewLink?: string }> {
  const drive = getDriveClient(accessToken);

  // Search for existing folder
  const parentClause = parentId
    ? ` and '${escapeDriveQueryValue(parentId)}' in parents`
    : "";
  const res = await drive.files.list({
    q: `name = '${escapeDriveQueryValue(name)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false${parentClause}`,
    fields: "files(id, name, webViewLink)",
    pageSize: 1,
  });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0] as { id: string; name: string; webViewLink?: string };
  }

  const created = await createFolder(accessToken, name, parentId);
  return created as { id: string; name: string; webViewLink?: string };
}

// ── File operations ───

export async function createDoc(
  accessToken: string,
  name: string,
  content: string,
  parentId?: string
) {
  const drive = getDriveClient(accessToken);
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.document",
      ...(parentId ? { parents: [parentId] } : {}),
    },
    media: {
      mimeType: "text/plain",
      body: content,
    },
    fields: "id, name, webViewLink",
  });
  return res.data;
}

export async function uploadFile(
  accessToken: string,
  name: string,
  body: Buffer | Readable | string,
  mimeType: string,
  parentId?: string
) {
  const drive = getDriveClient(accessToken);
  const res = await drive.files.create({
    requestBody: {
      name,
      ...(parentId ? { parents: [parentId] } : {}),
    },
    media: {
      mimeType,
      body,
    },
    fields: "id, name, mimeType, webViewLink",
  });
  return res.data;
}

// Recursively lists every file under `folderId`, tagging each with `sourceUnit`
// — the name of the immediate subfolder it was found in (the teacher's own unit
// grouping). Files directly under the scanned folder carry sourceUnit: null.
// Used both by the initial import scan and by the non-destructive unit retrofit.
export type ScannedFile = {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  sourceUnit: string | null;
};

// A folder subtree, exactly as Drive has it — no interpretation. What the
// levels MEAN is decided separately, by the level map the teacher declares
// (src/lib/import-structure.ts). Keeping the scan dumb is the point: every
// structural bug so far came from the scanner deciding what a folder was
// while it walked (#682 turned "Dash Q3/Letters/" into a unit called
// "Letters"). A scanner that only reports shape cannot make that mistake, and
// the interpretation is a pure function that can be tested without Drive.
export type ScannedNode = {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  children: ScannedNode[]; // always [] for files
};

export async function scanTree(
  accessToken: string,
  folderId: string,
  opts: { maxDepth?: number } = {}
): Promise<ScannedNode> {
  const drive = getDriveClient(accessToken);
  const maxDepth = opts.maxDepth ?? 10;

  const root = await drive.files.get({
    fileId: folderId,
    fields: "id, name, mimeType",
    supportsAllDrives: true,
  });

  async function walk(node: ScannedNode, depth: number): Promise<ScannedNode> {
    if (!node.isFolder || depth >= maxDepth) return node;
    let pageToken: string | undefined;
    do {
      const res = await drive.files.list({
        q: `'${escapeDriveQueryValue(node.id)}' in parents and trashed = false`,
        fields: "nextPageToken, files(id, name, mimeType)",
        pageSize: 200,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      for (const f of res.data.files ?? []) {
        const isFolder = f.mimeType === "application/vnd.google-apps.folder";
        const child: ScannedNode = {
          id: f.id!,
          name: f.name!,
          mimeType: f.mimeType!,
          isFolder,
          children: [],
        };
        node.children.push(await walk(child, depth + 1));
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
    return node;
  }

  return walk(
    {
      id: root.data.id!,
      name: root.data.name ?? "",
      mimeType: root.data.mimeType!,
      isFolder: root.data.mimeType === "application/vnd.google-apps.folder",
      children: [],
    },
    0
  );
}

export async function scanFolderUnits(
  accessToken: string,
  folderId: string
): Promise<ScannedFile[]> {
  const drive = getDriveClient(accessToken);
  const allFiles: ScannedFile[] = [];

  async function listFolder(parentId: string, sourceUnit: string | null) {
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
          // The unit is the FIRST folder below the scanned root, and it stays
          // the unit all the way down. Previously this passed `file.name` at
          // every depth, so the deepest folder won: a file in
          // "Dash Q3/Letters/" came back with sourceUnit "Letters", and her
          // real unit — Dash — never became a unit at all. That is the
          // over-splitting failure mode, produced by the scanner rather than
          // by the AI. Nested folders are organisation inside a unit, not
          // units of their own.
          await listFolder(file.id!, sourceUnit ?? file.name ?? null);
        } else {
          allFiles.push({
            id: file.id!,
            name: file.name!,
            mimeType: file.mimeType!,
            parents: file.parents ?? [],
            sourceUnit,
          });
        }
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
  }

  // The top-level folder being scanned is not itself a unit — files sitting
  // directly in it keep sourceUnit null (that is how the year plan is found).
  await listFolder(folderId, null);
  return allFiles;
}

export async function listFilesInFolder(accessToken: string, folderId: string) {
  const drive = getDriveClient(accessToken);
  const res = await drive.files.list({
    q: `'${escapeDriveQueryValue(folderId)}' in parents and trashed = false`,
    fields: "files(id, name, mimeType, modifiedTime, webViewLink)",
    pageSize: 200,
  });
  return res.data.files ?? [];
}

export async function listFiles(accessToken: string, query?: string) {
  const drive = getDriveClient(accessToken);
  const res = await drive.files.list({
    q: query,
    fields: "files(id, name, mimeType, modifiedTime, parents, webViewLink)",
    orderBy: "modifiedTime desc",
    pageSize: 20,
  });
  return res.data.files ?? [];
}
