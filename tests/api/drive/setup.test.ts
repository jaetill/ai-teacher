import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const { mockDbSelect, mockDbUpdate, mockDbInsert, mockFindOrCreateFolder } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbInsert: vi.fn(),
  mockFindOrCreateFolder: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/db", () => ({
  db: { select: mockDbSelect, update: mockDbUpdate, insert: mockDbInsert },
}));
vi.mock("@/db/schema", () => ({
  driveFolders: { folderKey: "folderKey", ownerEmail: "ownerEmail", driveId: "driveId" },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ col, val })),
  and: vi.fn((...args) => ({ and: args })),
}));
vi.mock("@/lib/drive", () => ({ findOrCreateFolder: mockFindOrCreateFolder }));

import { getServerSession } from "next-auth";
import { eq, and } from "drizzle-orm";
import { POST } from "../../../src/app/api/drive/setup/route";

const mockGetServerSession = vi.mocked(getServerSession);
const mockEq = vi.mocked(eq);
const mockAnd = vi.mocked(and);

function makeSelectChain(value: unknown) {
  const p = Promise.resolve(value);
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
  const p = Promise.resolve(undefined);
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.set = self;
  chain.where = self;
  chain.then = (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => p.then(r, j);
  chain.catch = (j: (e: unknown) => unknown) => p.catch(j);
  chain.finally = (fn: () => void) => p.finally(fn);
  return chain;
}

function makeInsertChain() {
  const p = Promise.resolve(undefined);
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.values = self;
  chain.then = (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => p.then(r, j);
  chain.catch = (j: (e: unknown) => unknown) => p.catch(j);
  chain.finally = (fn: () => void) => p.finally(fn);
  return chain;
}

const SESSION_A = {
  accessToken: "token-a",
  user: { email: "teacher-a@school.edu" },
  expires: "",
};

const SESSION_B = {
  accessToken: "token-b",
  user: { email: "teacher-b@school.edu" },
  expires: "",
};

describe("POST /api/drive/setup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // findOrCreateFolder returns a folder with a deterministic id
    mockFindOrCreateFolder.mockImplementation((_token: string, name: string) =>
      Promise.resolve({ id: `drive-id-${name.replace(/\s/g, "-")}` }),
    );
  });

  it("returns 401 when there is no session", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await POST();

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Not authenticated");
  });

  it("returns 401 when session has no email", async () => {
    mockGetServerSession.mockResolvedValueOnce({
      accessToken: "token",
      user: {},
      expires: "",
    });

    const res = await POST();

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Session missing email");
  });

  it("scopes SELECT by ownerEmail on every upsert check", async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION_A);
    // All SELECT calls return "no existing row" → INSERT path
    mockDbSelect.mockReturnValue(makeSelectChain([]));
    mockDbInsert.mockReturnValue(makeInsertChain());

    await POST();

    // eq should have been called with ownerEmail on every SELECT
    const eqCalls = mockEq.mock.calls;
    const ownerEmailCalls = eqCalls.filter(([, val]) => val === "teacher-a@school.edu");
    expect(ownerEmailCalls.length).toBeGreaterThan(0);

    // and() should be called wrapping (folderKey eq, ownerEmail eq) for every SELECT
    expect(mockAnd).toHaveBeenCalled();
  });

  it("scopes UPDATE WHERE by ownerEmail", async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION_A);
    // First SELECT returns an existing row → UPDATE path for at least one folder
    mockDbSelect.mockReturnValueOnce(makeSelectChain([{ id: "existing-id" }]));
    // Remaining SELECTs return empty → INSERT path
    mockDbSelect.mockReturnValue(makeSelectChain([]));
    mockDbUpdate.mockReturnValue(makeUpdateChain());
    mockDbInsert.mockReturnValue(makeInsertChain());

    await POST();

    // UPDATE should have been called
    expect(mockDbUpdate).toHaveBeenCalled();
    // ownerEmail should appear in eq calls (both SELECT and UPDATE WHERE use it)
    const eqCalls = mockEq.mock.calls;
    const ownerEmailCalls = eqCalls.filter(([, val]) => val === "teacher-a@school.edu");
    expect(ownerEmailCalls.length).toBeGreaterThanOrEqual(2); // at least SELECT + UPDATE
  });

  it("includes ownerEmail in INSERT values", async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION_A);
    // All SELECTs return empty → INSERT path for all folders
    mockDbSelect.mockReturnValue(makeSelectChain([]));
    const insertChain = makeInsertChain();
    const valuesSpy = vi.fn().mockReturnValue(insertChain);
    mockDbInsert.mockReturnValue({ values: valuesSpy });

    await POST();

    // Every INSERT values call must include ownerEmail
    expect(valuesSpy).toHaveBeenCalled();
    const allCalls = (valuesSpy.mock.calls as [{ ownerEmail?: string }][]).map(([v]) => v);
    expect(allCalls.every((v) => v.ownerEmail === "teacher-a@school.edu")).toBe(true);
  });

  it("does not touch session A rows when session B calls setup", async () => {
    // Session B's SELECT must use B's ownerEmail — it must NOT match A's rows.
    // We verify this by asserting eq is always called with B's email, never A's.
    mockGetServerSession.mockResolvedValueOnce(SESSION_B);
    mockDbSelect.mockReturnValue(makeSelectChain([]));
    const insertChain = makeInsertChain();
    const valuesSpy = vi.fn().mockReturnValue(insertChain);
    mockDbInsert.mockReturnValue({ values: valuesSpy });

    await POST();

    const eqCalls = mockEq.mock.calls;
    const emailArgs = eqCalls
      .map(([, val]) => val)
      .filter((v) => v === "teacher-a@school.edu" || v === "teacher-b@school.edu");
    // Only session B's email should appear — never session A's
    expect(emailArgs.every((e) => e === "teacher-b@school.edu")).toBe(true);
    expect(emailArgs.length).toBeGreaterThan(0);
  });

  it("returns 200 with folder map on success", async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION_A);
    mockDbSelect.mockReturnValue(makeSelectChain([]));
    mockDbInsert.mockReturnValue(makeInsertChain());

    const res = await POST();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe("Drive folder structure created and saved to database");
    expect(body.folders).toHaveProperty("root");
    expect(body.folders).toHaveProperty("standards");
  });
});
