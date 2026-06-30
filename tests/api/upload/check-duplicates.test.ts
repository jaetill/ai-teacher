import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────
const { mockDbSelect, mockListFilesInFolder } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockListFilesInFolder: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/db", () => ({ db: { select: mockDbSelect } }));
vi.mock("@/db/schema", () => ({ driveFolders: {}, materials: {} }));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col, val) => ({ type: "eq", val })),
  and: vi.fn((...args) => ({ type: "and", args })),
  or: vi.fn((...args) => ({ type: "or", args })),
  isNull: vi.fn((col) => ({ type: "isNull", col })),
  inArray: vi.fn((_col, vals) => ({ type: "inArray", vals })),
}));
vi.mock("@/lib/drive", () => ({ listFilesInFolder: mockListFilesInFolder }));
vi.mock("@/lib/upload-utils", () => ({
  buildFolderKey: vi.fn((...args: unknown[]) => args.filter(Boolean).join("_")),
}));

import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { eq, or, isNull } from "drizzle-orm";
import { POST } from "../../../src/app/api/upload/check-duplicates/route";

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

const DEFAULT_FILES = [{ name: "unit-plan.pdf", grade: 8, destination: "Q1", category: "Lessons" }];

function makeRequest(files = DEFAULT_FILES) {
  return {
    json: () => Promise.resolve({ files }),
  } as unknown as Request;
}

describe("POST /api/upload/check-duplicates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListFilesInFolder.mockResolvedValue([]);
    mockGetToken.mockResolvedValue({ accessToken: "tok" });
  });

  it("returns 401 when there is no access token", async () => {
    mockGetToken.mockResolvedValueOnce(null);

    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Not authenticated");
  });

  it("returns 401 when the JWT carries no accessToken", async () => {
    mockGetToken.mockResolvedValueOnce({});

    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Not authenticated");
  });

  it("returns 401 when session has no email claim", async () => {
    mockGetServerSession.mockResolvedValueOnce({ accessToken: "tok", user: {} });

    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Session missing email");
  });

  it("scopes the driveFolders lookup to the caller's email (IDOR regression)", async () => {
    mockGetServerSession.mockResolvedValueOnce({
      accessToken: "tok",
      user: { email: "teacher-a@school.edu" },
    });
    // folder lookup → teacher-a's folder
    mockDbSelect.mockReturnValueOnce(
      makeSelectChain([{ folderKey: "8_Q1_Lessons", driveId: "folder-a" }]),
    );
    // materials lookup (second select) → no matches
    mockDbSelect.mockReturnValueOnce(makeSelectChain([]));

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    // eq() must be called with the caller's email in the driveFolders WHERE clause
    expect(mockEq.mock.calls.some(([, v]) => v === "teacher-a@school.edu")).toBe(true);
    // or() and isNull() compose the open-null read policy
    expect(mockOr).toHaveBeenCalled();
    expect(mockIsNull).toHaveBeenCalled();
  });

  it("does NOT allow teacher-b to see teacher-a's folders (cross-user isolation)", async () => {
    mockGetServerSession.mockResolvedValueOnce({
      accessToken: "tok-b",
      user: { email: "teacher-b@school.edu" },
    });
    // teacher-b's scoped query returns no folders
    mockDbSelect.mockReturnValueOnce(makeSelectChain([]));

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    // No folder found → file is not a duplicate (safe fallback)
    expect(body.results[0].isDuplicate).toBe(false);
    // The eq() call used teacher-b's email, not teacher-a's
    expect(mockEq.mock.calls.some(([, v]) => v === "teacher-b@school.edu")).toBe(true);
    expect(mockEq.mock.calls.some(([, v]) => v === "teacher-a@school.edu")).toBe(false);
  });

  it("flags a file as duplicate when it exists in the Drive folder", async () => {
    mockGetServerSession.mockResolvedValueOnce({
      accessToken: "tok",
      user: { email: "teacher@school.edu" },
    });
    mockDbSelect.mockReturnValueOnce(
      makeSelectChain([{ folderKey: "8_Q1_Lessons", driveId: "folder-1" }]),
    );
    // Drive already has a file with the same name
    mockListFilesInFolder.mockResolvedValueOnce([{ name: "unit-plan.pdf" }]);
    // materials select returns empty
    mockDbSelect.mockReturnValueOnce(makeSelectChain([]));

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0].isDuplicate).toBe(true);
    expect(body.results[0].reason).toBe("Exists in Drive folder");
  });

  it("flags a file as duplicate when it exists in the materials DB", async () => {
    mockGetServerSession.mockResolvedValueOnce({
      accessToken: "tok",
      user: { email: "teacher@school.edu" },
    });
    mockDbSelect.mockReturnValueOnce(
      makeSelectChain([{ folderKey: "8_Q1_Lessons", driveId: "folder-1" }]),
    );
    // Drive folder is empty
    mockListFilesInFolder.mockResolvedValueOnce([]);
    // materials DB has a matching entry
    mockDbSelect.mockReturnValueOnce(
      makeSelectChain([{ title: "unit-plan.pdf", driveFolderId: "folder-1" }]),
    );

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0].isDuplicate).toBe(true);
    expect(body.results[0].reason).toBe("Exists in database");
  });

  it("scopes the materials DB lookup to the caller's email (IDOR regression, #566)", async () => {
    mockGetServerSession.mockResolvedValueOnce({
      accessToken: "tok",
      user: { email: "teacher-a@school.edu" },
    });
    // driveFolders: teacher-a's folder found
    mockDbSelect.mockReturnValueOnce(
      makeSelectChain([{ folderKey: "8_Q1_Lessons", driveId: "folder-a" }]),
    );
    // materials query → empty (no duplicate found)
    mockDbSelect.mockReturnValueOnce(makeSelectChain([]));

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    // eq() must be called with teacher-a's email for BOTH the driveFolders and materials queries
    const emailEqCalls = mockEq.mock.calls.filter(([, v]) => v === "teacher-a@school.edu");
    expect(emailEqCalls.length).toBeGreaterThanOrEqual(2);
    // or()/isNull() compose the open-null owner predicate in both queries
    expect(mockOr.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(mockIsNull.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("does NOT expose teacher-a's materials to teacher-b via materials DB (cross-user isolation, #566)", async () => {
    // teacher-b queries check-duplicates; the folder exists (e.g. ownerEmail=null legacy row)
    mockGetServerSession.mockResolvedValueOnce({
      accessToken: "tok-b",
      user: { email: "teacher-b@school.edu" },
    });
    // teacher-b's driveFolders query returns a shared/legacy folder
    mockDbSelect.mockReturnValueOnce(
      makeSelectChain([{ folderKey: "8_Q1_Lessons", driveId: "folder-shared" }]),
    );
    // teacher-b's materials query returns nothing — ownerEmail predicate filtered out teacher-a's rows
    mockDbSelect.mockReturnValueOnce(makeSelectChain([]));

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    // File is not flagged as a duplicate — teacher-a's material was not visible to teacher-b
    expect(body.results[0].isDuplicate).toBe(false);

    // The ownerEmail predicate uses teacher-b's email, never teacher-a's
    expect(mockEq.mock.calls.some(([, v]) => v === "teacher-b@school.edu")).toBe(true);
    expect(mockEq.mock.calls.some(([, v]) => v === "teacher-a@school.edu")).toBe(false);
  });
});
