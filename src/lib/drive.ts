import { google } from "googleapis";
import type { Readable } from "stream";
import { buildSlidesRequests } from "@/lib/draft-formats";

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

/**
 * Create a native Google Sheet from CSV.
 *
 * Drive does the parsing: upload `text/csv` media against a target mimeType of
 * `…google-apps.spreadsheet` and the import converts it into real rows and
 * columns. No Sheets API call and no extra scope — this is the same
 * requestBody/media conversion trick `createDoc` uses for text → Doc.
 */
export async function createSheet(
  accessToken: string,
  name: string,
  csv: string,
  parentId?: string
) {
  const drive = getDriveClient(accessToken);
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.spreadsheet",
      ...(parentId ? { parents: [parentId] } : {}),
    },
    media: {
      mimeType: "text/csv",
      body: csv,
    },
    fields: "id, name, webViewLink",
  });
  return res.data;
}

/**
 * Create a native Google Slides deck from a parsed outline.
 *
 * Slides has no import-from-text path the way Docs and Sheets do, so this goes
 * through the Slides API instead: create the presentation, then one
 * batchUpdate that builds every slide atomically. `presentations.create` and
 * `presentations.batchUpdate` both accept `drive.file`, which the app already
 * holds — no new consent screen for the teacher.
 *
 * Slides API creates in Drive root, so the file is moved into the app's folder
 * afterwards. A failed move is not fatal: the deck exists and is linked, it
 * just sits in the root instead of the grade/quarter folder.
 */
export async function createSlides(
  accessToken: string,
  name: string,
  slides: { title: string; bullets: string[] }[],
  parentId?: string
) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const slidesApi = google.slides({ version: "v1", auth });

  const created = await slidesApi.presentations.create({
    requestBody: { title: name },
  });
  const presentationId = created.data.presentationId;
  if (!presentationId) throw new Error("Slides API returned no presentationId");

  // A new presentation arrives with one blank slide. Ours are appended after
  // it and it is deleted at the end of the same batch, so the teacher never
  // sees a stray empty first slide.
  const blankSlideId = created.data.slides?.[0]?.objectId;

  // Built by a pure function so the object-ID rules are testable without a
  // Google client — see buildSlidesRequests.
  const requests = buildSlidesRequests(slides, blankSlideId);

  if (requests.length > 0) {
    try {
      await slidesApi.presentations.batchUpdate({
        presentationId,
        requestBody: { requests },
      });
    } catch (err) {
      // The presentation already exists at this point. Leaving it behind on a
      // failed batch litters her Drive with empty decks she has to find and
      // delete — two are sitting there from the object-ID bug. Bin it, then
      // rethrow so accept-draft still reports the real failure.
      try {
        await getDriveClient(accessToken).files.delete({ fileId: presentationId });
      } catch (cleanupErr) {
        console.error("[drive] could not remove the failed presentation:", cleanupErr);
      }
      throw err;
    }
  }

  const drive = getDriveClient(accessToken);
  if (parentId) {
    try {
      const current = await drive.files.get({
        fileId: presentationId,
        fields: "parents",
      });
      await drive.files.update({
        fileId: presentationId,
        addParents: parentId,
        removeParents: (current.data.parents ?? []).join(","),
        fields: "id",
      });
    } catch (err) {
      console.error("[drive] could not move presentation into folder:", err);
    }
  }

  const final = await drive.files.get({
    fileId: presentationId,
    fields: "id, name, webViewLink",
  });
  return final.data;
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
