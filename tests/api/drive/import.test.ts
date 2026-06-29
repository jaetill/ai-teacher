import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────
const { mockDbSelect, mockDbInsert, mockDriveFilesList, mockDriveFilesCopy } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDriveFilesList: vi.fn(),
  mockDriveFilesCopy: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/db", () => ({ db: { select: mockDbSelect, insert: mockDbInsert } }));
vi.mock("@/db/schema", () => ({ driveFolders: {}, materials: {} }));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col, val) => ({ type: "eq", val })),
  and: vi.fn((...args) => ({ type: "and", args })),
  or: vi.fn((...args) => ({ type: "or", args })),
  isNull: vi.fn((col) => ({ type: "isNull", col })),
}));
vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class {
        setCredentials() {}
      },
    },
    drive: vi.fn(() => ({
      files: { list: mockDriveFilesList, copy: mockDriveFilesCopy },
    })),
  },
}));
vi.mock("@/lib/upload-utils", () => ({
  buildFolderKey: vi.fn((...args: unknown[]) => args.filter(Boolean).join("_")),
}));

import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { eq, or, isNull } from "drizzle-orm";
import { GET, POST } from "../../../src/app/api/drive/import/route";

const mockGetServerSession = vi.mocked(getServerSession);
const mockGetToken = vi.mocked(getToken);
const mockEq = vi.mocked(eq);
const mockOr = vi.mocked(or);
const mockIsNull = vi.mocked(isNull);

function makeSelectChain(resolvedValue: unknown) {
  const p = Promise.resolve(resolvedValue);
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.from = self;
  chain.where = self;
  chain.limit = self;
  chain.then = (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => p.then(r, j);
  chain.catch = (j: (e: unknown) => unknown) => p.catch(j);
  chain.finally = (fn: () => void) => p.finally(fn);
  return chain;
}

function makePostBody(overrides: object = {}) {
  return {
    sourceFolderId: "src-folder-1",
    files: [
      {
        sourceFileId: "src-file-1",
        name: "lesson-slides.pdf",
        category: "Lessons",
        materialType: "slides",
        grade: 8,
        destination: "Q1",
      },
    ],
    ...overrides,
  };
}

function makePostRequest(body: object = makePostBody()) {
  return { json: () => Promise.resolve(body) } as unknown as Request;
}

describe("GET /api/drive/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetToken.mockResolvedValue({ accessToken: "tok" });
  });

  it("returns 401 when there is no access token", async () => {
    mockGetToken.mockResolvedValueOnce(null);
    const req = new Request("http://localhost/api/drive/import?folderId=folder-1");

    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Not authenticated");
  });

  it("returns 401 when the JWT carries no accessToken", async () => {
    mockGetToken.mockResolvedValueOnce({});
    const req = new Request("http://localhost/api/drive/import?folderId=folder-1");

    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Not authenticated");
  });

  it("returns 400 when folderId is missing", async () => {
    const req = new Request("http://localhost/api/drive/import");

    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("folderId required");
  });

  it("returns file list when Drive folder is scanned successfully", async () => {
    mockDriveFilesList.mockResolvedValueOnce({
      data: {
        files: [
          { id: "f-1", name: "notes.pdf", mimeType: "application/pdf", parents: ["folder-1"] },
        ],
        nextPageToken: null,
      },
    });
    const req = new Request("http://localhost/api/drive/import?folderId=folder-1");

    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.files).toHaveLength(1);
    expect(body.files[0].name).toBe("notes.pdf");
    expect(body.count).toBe(1);
  });
});

describe("POST /api/drive/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetToken.mockResolvedValue({ accessToken: "tok" });
  });

  it("returns 401 when there is no access token", async () => {
    mockGetToken.mockResolvedValueOnce(null);

    const res = await POST(makePostRequest());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Not authenticated");
  });

  it("returns 401 when session has no email claim", async () => {
    mockGetServerSession.mockResolvedValueOnce({ accessToken: "tok", user: {} });

    const res = await POST(makePostRequest());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Session missing email");
  });

  it("scopes the driveFolders lookup to the caller's email (IDOR regression)", async () => {
    mockGetServerSession.mockResolvedValueOnce({
      accessToken: "tok",
      user: { email: "teacher-a@school.edu" },
    });
    mockDbSelect.mockReturnValueOnce(makeSelectChain([{ driveId: "folder-a" }]));
    mockDriveFilesCopy.mockResolvedValueOnce({
      data: {
        id: "copied-id",
        mimeType: "application/pdf",
        webViewLink: "https://drive.google.com/file/d/copied-id/view",
      },
    });
    mockDbInsert.mockReturnValueOnce({ values: vi.fn().mockResolvedValue(undefined) });

    await POST(makePostRequest());

    // eq() must be called with the caller's email in the WHERE clause
    expect(mockEq.mock.calls.some(([, v]) => v === "teacher-a@school.edu")).toBe(true);
    // or() and isNull() must be used to compose the owner predicate with legacy-row fallback
    expect(mockOr).toHaveBeenCalled();
    expect(mockIsNull).toHaveBeenCalled();
  });

  it("reports folder-not-found for teacher-b when teacher-a owns the folder (cross-user isolation)", async () => {
    mockGetServerSession.mockResolvedValueOnce({
      accessToken: "tok-b",
      user: { email: "teacher-b@school.edu" },
    });
    // teacher-b's scoped query returns nothing
    mockDbSelect.mockReturnValueOnce(makeSelectChain([]));

    const res = await POST(makePostRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0].status).toBe("error: folder not found");
    // The eq() call used teacher-b's email, not teacher-a's
    expect(mockEq.mock.calls.some(([, v]) => v === "teacher-b@school.edu")).toBe(true);
    expect(mockEq.mock.calls.some(([, v]) => v === "teacher-a@school.edu")).toBe(false);
  });

  it("stamps ownerEmail on the materials insert (IDOR fix)", async () => {
    mockGetServerSession.mockResolvedValueOnce({
      accessToken: "tok",
      user: { email: "teacher-a@school.edu" },
    });
    mockDbSelect.mockReturnValueOnce(makeSelectChain([{ driveId: "folder-a" }]));
    mockDriveFilesCopy.mockResolvedValueOnce({
      data: {
        id: "copied-id",
        mimeType: "application/pdf",
        webViewLink: "https://drive.google.com/file/d/copied-id/view",
      },
    });
    const valuesMock = vi.fn().mockResolvedValue(undefined);
    mockDbInsert.mockReturnValueOnce({ values: valuesMock });

    await POST(makePostRequest());

    expect(valuesMock).toHaveBeenCalledOnce();
    expect(valuesMock.mock.calls[0][0]).toMatchObject({ ownerEmail: "teacher-a@school.edu" });
  });

  it("returns copied status and Drive URL on success", async () => {
    mockGetServerSession.mockResolvedValueOnce({
      accessToken: "tok",
      user: { email: "teacher@school.edu" },
    });
    mockDbSelect.mockReturnValueOnce(makeSelectChain([{ driveId: "folder-id" }]));
    mockDriveFilesCopy.mockResolvedValueOnce({
      data: {
        id: "new-file-id",
        mimeType: "application/pdf",
        webViewLink: "https://drive.google.com/file/d/new-file-id/view",
      },
    });
    mockDbInsert.mockReturnValueOnce({ values: vi.fn().mockResolvedValue(undefined) });

    const res = await POST(makePostRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0].status).toBe("copied");
    expect(body.results[0].driveWebUrl).toContain("new-file-id");
  });
});
