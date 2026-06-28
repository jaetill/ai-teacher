import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────
const { mockDbSelect, mockDbInsert, mockDbUpdate, mockFindOrCreateFolder } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockFindOrCreateFolder: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/db", () => ({
  db: { select: mockDbSelect, insert: mockDbInsert, update: mockDbUpdate },
}));
vi.mock("@/db/schema", () => ({ driveFolders: {} }));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col, val) => ({ type: "eq", val })),
  and: vi.fn((...args) => ({ type: "and", args })),
  or: vi.fn((...args) => ({ type: "or", args })),
  isNull: vi.fn((col) => ({ type: "isNull", col })),
}));
vi.mock("@/lib/drive", () => ({ findOrCreateFolder: mockFindOrCreateFolder }));

import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { eq, or, isNull } from "drizzle-orm";
import { POST } from "../../../src/app/api/drive/setup/route";

const mockGetServerSession = vi.mocked(getServerSession);
const mockGetToken = vi.mocked(getToken);
const mockEq = vi.mocked(eq);
const mockOr = vi.mocked(or);
const mockIsNull = vi.mocked(isNull);

function makeRequest() {
  return new Request("http://localhost/api/drive/setup", { method: "POST" });
}

// Convenience: a signed-in caller with a Drive token + email.
function authed(email = "teacher@school.edu") {
  mockGetToken.mockResolvedValue({ accessToken: "tok" });
  mockGetServerSession.mockResolvedValue({ user: { email } });
}

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

describe("POST /api/drive/setup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // findOrCreateFolder is called ~80 times (root + standards + 3 grades × ~26 children)
    mockFindOrCreateFolder.mockResolvedValue({ id: "folder-id" });
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
    mockGetToken.mockResolvedValueOnce({ accessToken: "tok" });
    mockGetServerSession.mockResolvedValueOnce({ user: {} });

    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Session missing email");
  });

  it("scopes the driveFolders lookup to the caller's email (IDOR regression — insert path)", async () => {
    mockGetToken.mockResolvedValueOnce({ accessToken: "tok" });
    mockGetServerSession.mockResolvedValueOnce({
      user: { email: "teacher-a@school.edu" },
    });
    // All selects return [] → insert path for every folder
    mockDbSelect.mockImplementation(() => makeSelectChain([]));
    const capturedValues: unknown[] = [];
    mockDbInsert.mockImplementation(() => ({
      values: vi.fn().mockImplementation((vals: unknown) => {
        capturedValues.push(vals);
        return Promise.resolve(undefined);
      }),
    }));

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    // eq() must be called with the caller's email in the WHERE predicate
    expect(mockEq.mock.calls.some(([, v]) => v === "teacher-a@school.edu")).toBe(true);
    // or() and isNull() compose the open-null read policy
    expect(mockOr).toHaveBeenCalled();
    expect(mockIsNull).toHaveBeenCalled();
    // Every INSERT must carry ownerEmail equal to the session user
    expect(capturedValues.length).toBeGreaterThan(0);
    expect(
      (capturedValues as Array<Record<string, unknown>>).every(
        (v) => v.ownerEmail === "teacher-a@school.edu",
      ),
    ).toBe(true);
  });

  it("scopes the UPDATE to the caller's email and sets ownerEmail on the row (update path)", async () => {
    mockGetToken.mockResolvedValueOnce({ accessToken: "tok" });
    mockGetServerSession.mockResolvedValueOnce({
      user: { email: "teacher-a@school.edu" },
    });
    // All selects return a row → update path for every folder
    mockDbSelect.mockImplementation(() => makeSelectChain([{ id: "existing-row" }]));
    const capturedSetArgs: unknown[] = [];
    mockDbUpdate.mockImplementation(() => {
      const chain = makeUpdateChain();
      // Wrap set() to capture the values
      chain.set = vi.fn().mockImplementation((vals: unknown) => {
        capturedSetArgs.push(vals);
        return makeUpdateChain();
      });
      return chain;
    });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    // UPDATE must also scope by ownerEmail
    expect(mockEq.mock.calls.some(([, v]) => v === "teacher-a@school.edu")).toBe(true);
    // SET must stamp ownerEmail onto the row
    expect(capturedSetArgs.length).toBeGreaterThan(0);
    expect(
      (capturedSetArgs as Array<Record<string, unknown>>).every(
        (v) => v.ownerEmail === "teacher-a@school.edu",
      ),
    ).toBe(true);
  });

  it("returns the folder map on success", async () => {
    mockGetToken.mockResolvedValueOnce({ accessToken: "tok" });
    mockGetServerSession.mockResolvedValueOnce({
      user: { email: "teacher@school.edu" },
    });
    mockDbSelect.mockImplementation(() => makeSelectChain([]));
    mockDbInsert.mockImplementation(() => ({
      values: vi.fn().mockResolvedValue(undefined),
    }));

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toMatch(/created and saved/);
    expect(body.folders).toHaveProperty("root");
    expect(body.folders["root"]).toBe("folder-id");
  });
});
