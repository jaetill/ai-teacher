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
          // This subfolder becomes the unit for everything inside it.
          await listFolder(file.id!, file.name ?? null);
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

  // The top-level folder being scanned is not itself a unit.
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
