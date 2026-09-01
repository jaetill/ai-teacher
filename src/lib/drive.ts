import { google } from "googleapis";
import type { Readable } from "stream";
import { buildSlidesRequests } from "@/lib/draft-formats";
import type { DocSpec, DraftSpec, SheetSpec, SlidesSpec } from "@/lib/draft-spec";
import {
  buildDocBackgroundRequest,
  buildDocRequests,
  buildSheetFormatRequests,
  buildSlideNotesRequests,
  buildSlidesRequests as buildStyledSlidesRequests,
  sheetValues,
} from "@/lib/google-requests";

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

// ── Spec-driven creation ───
//
// The styled path. createDoc/createSheet/createSlides above take plain text and
// produce plain files; these take a spec and produce the file she actually
// asked for — background, fonts, colours, frozen header, heading styles.
//
// Each follows the same shape: create the empty file, then batchUpdate it. The
// create call cannot carry formatting, which is why every one of these is two
// round trips rather than one.

async function moveIntoFolder(accessToken: string, fileId: string, parentId?: string) {
  if (!parentId) return;
  const drive = getDriveClient(accessToken);
  try {
    const current = await drive.files.get({ fileId, fields: "parents" });
    await drive.files.update({
      fileId,
      addParents: parentId,
      removeParents: (current.data.parents ?? []).join(","),
      fields: "id",
    });
  } catch (err) {
    console.error("[drive] could not move file into folder:", err);
  }
}

async function fileMeta(accessToken: string, fileId: string) {
  const drive = getDriveClient(accessToken);
  const res = await drive.files.get({
    fileId,
    fields: "id, name, mimeType, webViewLink",
  });
  return res.data;
}

export async function createSlidesFromSpec(
  accessToken: string,
  spec: SlidesSpec,
  parentId?: string
) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const slidesApi = google.slides({ version: "v1", auth });

  const created = await slidesApi.presentations.create({
    requestBody: { title: spec.title },
  });
  const presentationId = created.data.presentationId;
  if (!presentationId) throw new Error("Slides API returned no presentationId");

  const blankSlideId = created.data.slides?.[0]?.objectId;

  try {
    const requests = buildStyledSlidesRequests(spec, blankSlideId);
    if (requests.length > 0) {
      await slidesApi.presentations.batchUpdate({
        presentationId,
        requestBody: { requests },
      });
    }

    // Speaker notes need the notes-page shape ids, which only exist once the
    // slides do — so they are a second pass, not part of the batch above.
    const withNotes = spec.slides.some((s) => s.notes);
    if (withNotes) {
      const full = await slidesApi.presentations.get({ presentationId });
      const notesRequests = buildSlideNotesRequests(spec, (i) =>
        full.data.slides?.[i]?.slideProperties?.notesPage?.notesProperties
          ?.speakerNotesObjectId ?? null
      );
      if (notesRequests.length > 0) {
        await slidesApi.presentations.batchUpdate({
          presentationId,
          requestBody: { requests: notesRequests },
        });
      }
    }
  } catch (err) {
    // The presentation exists by now; leaving it behind litters her Drive with
    // an empty deck she has to hunt down.
    try {
      await getDriveClient(accessToken).files.delete({ fileId: presentationId });
    } catch (cleanupErr) {
      console.error("[drive] could not remove the failed presentation:", cleanupErr);
    }
    throw err;
  }

  await moveIntoFolder(accessToken, presentationId, parentId);
  return fileMeta(accessToken, presentationId);
}

export async function createSheetFromSpec(
  accessToken: string,
  spec: SheetSpec,
  parentId?: string
) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const sheetsApi = google.sheets({ version: "v4", auth });

  const created = await sheetsApi.spreadsheets.create({
    requestBody: { properties: { title: spec.title } },
  });
  const spreadsheetId = created.data.spreadsheetId;
  if (!spreadsheetId) throw new Error("Sheets API returned no spreadsheetId");
  const sheetId = created.data.sheets?.[0]?.properties?.sheetId ?? 0;

  try {
    const values = sheetValues(spec);
    await sheetsApi.spreadsheets.values.update({
      spreadsheetId,
      range: "A1",
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });

    const requests = buildSheetFormatRequests(spec, sheetId);
    if (requests.length > 0) {
      await sheetsApi.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests },
      });
    }
  } catch (err) {
    try {
      await getDriveClient(accessToken).files.delete({ fileId: spreadsheetId });
    } catch (cleanupErr) {
      console.error("[drive] could not remove the failed spreadsheet:", cleanupErr);
    }
    throw err;
  }

  await moveIntoFolder(accessToken, spreadsheetId, parentId);
  return fileMeta(accessToken, spreadsheetId);
}

export async function createDocFromSpec(accessToken: string, spec: DocSpec, parentId?: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const docsApi = google.docs({ version: "v1", auth });

  const created = await docsApi.documents.create({ requestBody: { title: spec.title } });
  const documentId = created.data.documentId;
  if (!documentId) throw new Error("Docs API returned no documentId");

  try {
    const requests = buildDocRequests(spec);
    const background = buildDocBackgroundRequest(spec.theme);
    const all = background ? [...requests, background] : requests;
    if (all.length > 0) {
      await docsApi.documents.batchUpdate({ documentId, requestBody: { requests: all } });
    }
  } catch (err) {
    try {
      await getDriveClient(accessToken).files.delete({ fileId: documentId });
    } catch (cleanupErr) {
      console.error("[drive] could not remove the failed document:", cleanupErr);
    }
    throw err;
  }

  await moveIntoFolder(accessToken, documentId, parentId);
  return fileMeta(accessToken, documentId);
}

/** Dispatch by kind, so the accept route does not branch on it. */
export async function createFromSpec(
  accessToken: string,
  spec: DraftSpec,
  parentId?: string
) {
  if (spec.kind === "slides") return createSlidesFromSpec(accessToken, spec, parentId);
  if (spec.kind === "sheet") return createSheetFromSpec(accessToken, spec, parentId);
  return createDocFromSpec(accessToken, spec, parentId);
}
