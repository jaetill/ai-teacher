import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const { mockDbSelect, mockDbInsert, mockDbUpdate } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/db", () => ({
  db: { select: mockDbSelect, insert: mockDbInsert, update: mockDbUpdate },
}));
vi.mock("@/db/schema", () => ({
  driveFolders: {
    folderKey: "df.folderKey",
    driveId: "df.driveId",
    ownerEmail: "df.ownerEmail",
    id: "df.id",
    name: "df.name",
    parentKey: "df.parentKey",
  },
  materials: {
    title: "mat.title",
    ownerEmail: "mat.ownerEmail",
    driveFolderId: "mat.driveFolderId",
    id: "mat.id",
  },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  inArray: vi.fn(),
}));
vi.mock("@/lib/drive", () => ({
  findOrCreateFolder: vi.fn(),
  listFilesInFolder: vi.fn(),
  uploadFile: vi.fn(),
}));
vi.mock("googleapis", () => ({
  google: {
    // Arrow functions cannot be used as constructors; use a class so `new OAuth2()` works.
    auth: {
      OAuth2: class {
        setCredentials = vi.fn();
      },
    },
    drive: vi.fn(() => ({
      files: {
        list: vi.fn().mockResolvedValue({ data: { files: [], nextPageToken: null } }),
        copy: vi.fn().mockResolvedValue({
          data: {
            id: "copied-id",
            mimeType: "text/plain",
            webViewLink: "https://drive.google.com/file/d/copied-id",
          },
        }),
      },
    })),
  },
}));
vi.mock("@/lib/upload-utils", () => ({
  buildFolderKey: vi.fn().mockReturnValue("grade_6_Q1_Curriculum"),
  getMimeType: vi.fn().mockReturnValue("text/plain"),
}));
// ── Imports after mocks ───────────────────────────────────────────────────────
import { getServerSession } from "next-auth";
import { eq } from "drizzle-orm";
import { findOrCreateFolder, listFilesInFolder, uploadFile } from "@/lib/drive";
import {
  GET as driveImportGet,
  POST as driveImportPost,
} from "../../src/app/api/drive/import/route";
import { POST as driveSetupPost } from "../../src/app/api/drive/setup/route";
import { POST as checkDuplicatesPost } from "../../src/app/api/upload/check-duplicates/route";
import { POST as uploadFilePost } from "../../src/app/api/upload/file/route";

const mockGetServerSession = vi.mocked(getServerSession);
const mockEq = vi.mocked(eq);
const mockFindOrCreate = vi.mocked(findOrCreateFolder);
const mockListFiles = vi.mocked(listFilesInFolder);
const mockUploadFile = vi.mocked(uploadFile);

// ── Fixtures ──────────────────────────────────────────────────────────────────
const TEACHER_EMAIL = "teacher@school.edu";
const AUTHED_SESSION = { user: { email: TEACHER_EMAIL }, accessToken: "tok", expires: "" };
const NO_EMAIL_SESSION = { user: {}, accessToken: "tok", expires: "" };

// ── Chain helpers ─────────────────────────────────────────────────────────────
function makeSelectChain(value: unknown) {
  const p = Promise.resolve(value);
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.from = self;
  chain.where = self;
  chain.limit = self;
  chain.orderBy = self;
  chain.then = (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => p.then(r, j);
  chain.catch = (j: (e: unknown) => unknown) => p.catch(j);
  chain.finally = (fn: () => void) => p.finally(fn);
  return chain;
}

function makeUpdateChain() {
  const p = Promise.resolve([]);
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.set = self;
  chain.where = self;
  chain.then = (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => p.then(r, j);
  chain.catch = (j: (e: unknown) => unknown) => p.catch(j);
  chain.finally = (fn: () => void) => p.finally(fn);
  return chain;
}

function makeInsertChain(returnVal: unknown[] = [], captured?: unknown[]) {
  const p = Promise.resolve(returnVal);
  const chain: Record<string, unknown> = {};
  chain.values = (vals: unknown) => {
    captured?.push(vals);
    return chain;
  };
  chain.returning = () => p;
  chain.onConflictDoNothing = () => Promise.resolve();
  chain.then = (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => p.then(r, j);
  chain.catch = (j: (e: unknown) => unknown) => p.catch(j);
  chain.finally = (fn: () => void) => p.finally(fn);
  return chain;
}

// ── drive/setup POST ──────────────────────────────────────────────────────────
describe("ownerEmail DB scoping — POST /api/drive/setup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindOrCreate.mockResolvedValue({ id: "drive-folder-id", name: "Mocked Folder" });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await driveSetupPost();

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Not authenticated");
  });

  it("returns 401 when session has no email", async () => {
    mockGetServerSession.mockResolvedValueOnce(NO_EMAIL_SESSION);

    const res = await driveSetupPost();

    expect(res.status).toBe(401);
  });

  it("stamps ownerEmail on every drive_folders insert", async () => {
    mockGetServerSession.mockResolvedValueOnce(AUTHED_SESSION);
    const inserted: unknown[] = [];
    mockDbSelect.mockReturnValue(makeSelectChain([])); // no existing rows → all inserts
    mockDbInsert.mockReturnValue(makeInsertChain([], inserted));

    await driveSetupPost();

    expect(inserted.length).toBeGreaterThan(0);
    for (const row of inserted) {
      expect(row).toMatchObject({ ownerEmail: TEACHER_EMAIL });
    }
  });

  it("scopes drive_folders SELECT by ownerEmail", async () => {
    mockGetServerSession.mockResolvedValueOnce(AUTHED_SESSION);
    // First folder exists → UPDATE; rest are new → INSERT
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([{ id: "existing-row" }]))
      .mockReturnValue(makeSelectChain([]));
    mockDbUpdate.mockReturnValue(makeUpdateChain());
    mockDbInsert.mockReturnValue(makeInsertChain([]));

    await driveSetupPost();

    expect(mockEq).toHaveBeenCalledWith("df.ownerEmail", TEACHER_EMAIL);
  });
});

// ── drive/import GET ──────────────────────────────────────────────────────────
describe("ownerEmail DB scoping — GET /api/drive/import", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = new Request("http://localhost/api/drive/import?folderId=abc");
    const res = await driveImportGet(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Not authenticated");
  });
});

// ── drive/import POST ─────────────────────────────────────────────────────────
describe("ownerEmail DB scoping — POST /api/drive/import", () => {
  const IMPORT_BODY = {
    sourceFolderId: "source-folder",
    files: [
      {
        sourceFileId: "src-file-id",
        name: "Unit Plan.pdf",
        category: "Curriculum",
        materialType: "curriculum",
        grade: 6,
        destination: "Q1",
      },
    ],
  };

  function makeRequest(body: unknown) {
    return new Request("http://localhost/api/drive/import", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await driveImportPost(makeRequest(IMPORT_BODY));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Not authenticated");
  });

  it("returns 401 when session has no email", async () => {
    mockGetServerSession.mockResolvedValueOnce(NO_EMAIL_SESSION);

    const res = await driveImportPost(makeRequest(IMPORT_BODY));

    expect(res.status).toBe(401);
  });

  it("scopes drive_folders lookup by ownerEmail in WHERE clause", async () => {
    mockGetServerSession.mockResolvedValueOnce(AUTHED_SESSION);
    mockDbSelect.mockReturnValue(makeSelectChain([])); // no folder found → file skipped

    await driveImportPost(makeRequest(IMPORT_BODY));

    expect(mockEq).toHaveBeenCalledWith("df.ownerEmail", TEACHER_EMAIL);
  });

  it("stamps ownerEmail on the materials insert", async () => {
    mockGetServerSession.mockResolvedValueOnce(AUTHED_SESSION);
    mockDbSelect.mockReturnValue(makeSelectChain([{ driveId: "drive-folder-id" }]));
    const inserted: unknown[] = [];
    mockDbInsert.mockReturnValue(makeInsertChain([], inserted));

    await driveImportPost(makeRequest(IMPORT_BODY));

    expect(inserted.length).toBe(1);
    expect(inserted[0]).toMatchObject({ ownerEmail: TEACHER_EMAIL });
  });
});

// ── upload/check-duplicates POST ──────────────────────────────────────────────
describe("ownerEmail DB scoping — POST /api/upload/check-duplicates", () => {
  const CHECK_BODY = {
    files: [{ name: "Lesson 1.pdf", grade: 6, destination: "Q1", category: "Lessons" }],
  };

  function makeRequest(body: unknown) {
    return new Request("http://localhost/api/upload/check-duplicates", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockListFiles.mockResolvedValue([]);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await checkDuplicatesPost(makeRequest(CHECK_BODY));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Not authenticated");
  });

  it("returns 401 when session has no email", async () => {
    mockGetServerSession.mockResolvedValueOnce(NO_EMAIL_SESSION);

    const res = await checkDuplicatesPost(makeRequest(CHECK_BODY));

    expect(res.status).toBe(401);
  });

  it("scopes drive_folders lookup by ownerEmail in WHERE clause", async () => {
    mockGetServerSession.mockResolvedValueOnce(AUTHED_SESSION);
    mockDbSelect.mockReturnValue(makeSelectChain([]));

    await checkDuplicatesPost(makeRequest(CHECK_BODY));

    expect(mockEq).toHaveBeenCalledWith("df.ownerEmail", TEACHER_EMAIL);
  });

  it("scopes materials lookup by ownerEmail when folders are found", async () => {
    mockGetServerSession.mockResolvedValueOnce(AUTHED_SESSION);
    // First select returns a folder row → driveIds non-empty → materials query runs
    mockDbSelect
      .mockReturnValueOnce(
        makeSelectChain([{ folderKey: "grade_6_Q1_Curriculum", driveId: "folder-id" }]),
      )
      .mockReturnValue(makeSelectChain([]));

    await checkDuplicatesPost(makeRequest(CHECK_BODY));

    expect(mockEq).toHaveBeenCalledWith("mat.ownerEmail", TEACHER_EMAIL);
  });
});

// ── upload/file POST ──────────────────────────────────────────────────────────
describe("ownerEmail DB scoping — POST /api/upload/file", () => {
  function makeRequest() {
    const formData = new FormData();
    formData.append("file", new Blob(["content"], { type: "text/plain" }), "lesson.txt");
    formData.append("name", "lesson.txt");
    formData.append("category", "Lessons");
    formData.append("materialType", "lesson");
    formData.append("grade", "6");
    formData.append("destination", "Q1");
    return new Request("http://localhost/api/upload/file", {
      method: "POST",
      body: formData,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockUploadFile.mockResolvedValue({
      id: "uploaded-id",
      mimeType: "text/plain",
      webViewLink: "https://drive.google.com/file/d/uploaded-id",
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await uploadFilePost(makeRequest());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Not authenticated");
  });

  it("returns 401 when session has no email", async () => {
    mockGetServerSession.mockResolvedValueOnce(NO_EMAIL_SESSION);

    const res = await uploadFilePost(makeRequest());

    expect(res.status).toBe(401);
  });

  it("scopes drive_folders lookup by ownerEmail in WHERE clause", async () => {
    mockGetServerSession.mockResolvedValueOnce(AUTHED_SESSION);
    mockDbSelect.mockReturnValue(makeSelectChain([])); // no folder → 404, but WHERE is exercised

    await uploadFilePost(makeRequest());

    expect(mockEq).toHaveBeenCalledWith("df.ownerEmail", TEACHER_EMAIL);
  });

  it("stamps ownerEmail on the materials insert", async () => {
    mockGetServerSession.mockResolvedValueOnce(AUTHED_SESSION);
    mockDbSelect.mockReturnValue(makeSelectChain([{ driveId: "folder-id" }]));
    const inserted: unknown[] = [];
    mockDbInsert.mockReturnValue(makeInsertChain([{ id: "mat-1" }], inserted));

    await uploadFilePost(makeRequest());

    expect(inserted.length).toBe(1);
    expect(inserted[0]).toMatchObject({ ownerEmail: TEACHER_EMAIL });
  });
});
