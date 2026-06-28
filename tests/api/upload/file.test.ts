import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────
const { mockDbSelect, mockDbInsert } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
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
vi.mock("@/lib/drive", () => ({
  uploadFile: vi.fn().mockResolvedValue({
    id: "drive-file-id",
    mimeType: "application/pdf",
    webViewLink: "https://drive.google.com/file/d/drive-file-id/view",
  }),
}));
vi.mock("@/lib/upload-utils", () => ({
  buildFolderKey: vi.fn((...args: unknown[]) => args.filter(Boolean).join("_")),
  getMimeType: vi.fn().mockReturnValue("application/pdf"),
}));
vi.mock("stream", async (importOriginal) => {
  const actual = await importOriginal<typeof import("stream")>();
  return { ...actual, Readable: { ...actual.Readable, from: vi.fn().mockReturnValue({}) } };
});

import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { eq, or, isNull } from "drizzle-orm";
import { POST } from "../../../src/app/api/upload/file/route";

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

function makeInsertChain() {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.values = self;
  chain.returning = () => Promise.resolve([{ id: "mat-1" }]);
  return chain;
}

function makeFormData(overrides: Record<string, string> = {}) {
  const data: Record<string, string> = {
    name: "lesson-slides.pdf",
    category: "Lessons",
    materialType: "slides",
    grade: "8",
    destination: "Q1",
    ...overrides,
  };
  return {
    get: (key: string) => {
      if (key === "file") {
        return { arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) } as unknown as File;
      }
      return data[key] ?? null;
    },
  } as unknown as FormData;
}

describe("POST /api/upload/file", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetToken.mockResolvedValue({ accessToken: "tok" });
  });

  it("returns 401 when there is no access token", async () => {
    mockGetToken.mockResolvedValueOnce(null);
    const req = { formData: () => Promise.resolve(makeFormData()) } as unknown as Request;

    const res = await POST(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Not authenticated");
  });

  it("returns 401 when session has no email claim", async () => {
    mockGetServerSession.mockResolvedValueOnce({ accessToken: "tok", user: {} });
    const req = { formData: () => Promise.resolve(makeFormData()) } as unknown as Request;

    const res = await POST(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Session missing email");
  });

  it("returns 404 when no matching drive folder exists for the caller", async () => {
    mockGetServerSession.mockResolvedValueOnce({
      accessToken: "tok",
      user: { email: "teacher-a@school.edu" },
    });
    mockDbSelect.mockReturnValueOnce(makeSelectChain([])); // no folder

    const req = { formData: () => Promise.resolve(makeFormData()) } as unknown as Request;
    const res = await POST(req);

    expect(res.status).toBe(404);
    expect(mockDbSelect).toHaveBeenCalledTimes(1);
  });

  it("scopes the driveFolders lookup to the caller's email (IDOR regression)", async () => {
    mockGetServerSession.mockResolvedValueOnce({
      accessToken: "tok",
      user: { email: "teacher-a@school.edu" },
    });
    // folder found (teacher-a's row)
    mockDbSelect.mockReturnValueOnce(makeSelectChain([{ driveId: "folder-a" }]));
    // insert material
    mockDbInsert.mockReturnValueOnce(makeInsertChain());

    const req = { formData: () => Promise.resolve(makeFormData()) } as unknown as Request;
    await POST(req);

    // eq() must be called with the caller's email somewhere in the WHERE
    expect(mockEq.mock.calls.some(([, v]) => v === "teacher-a@school.edu")).toBe(true);
    // or() must be used to compose the owner predicate (eq + isNull fallback)
    expect(mockOr).toHaveBeenCalled();
    // isNull() must be used as the legacy-row fallback
    expect(mockIsNull).toHaveBeenCalled();
  });

  it("does NOT allow teacher-b to upload to teacher-a's folder (cross-user isolation)", async () => {
    // teacher-b calls upload/file; the DB returns no folder for their scoped query
    mockGetServerSession.mockResolvedValueOnce({
      accessToken: "tok-b",
      user: { email: "teacher-b@school.edu" },
    });
    mockDbSelect.mockReturnValueOnce(makeSelectChain([])); // teacher-b's query returns nothing

    const req = { formData: () => Promise.resolve(makeFormData()) } as unknown as Request;
    const res = await POST(req);

    expect(res.status).toBe(404);
    // Confirm the eq() call used teacher-b's email, not teacher-a's
    expect(mockEq.mock.calls.some(([, v]) => v === "teacher-b@school.edu")).toBe(true);
    expect(mockEq.mock.calls.some(([, v]) => v === "teacher-a@school.edu")).toBe(false);
  });
});
