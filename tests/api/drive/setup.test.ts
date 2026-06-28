import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────
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
  driveFolders: { folderKey: "folderKey", ownerEmail: "ownerEmail", driveId: "driveId" },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ col, val })),
  and: vi.fn((...args) => ({ and: args })),
}));
vi.mock("@/lib/drive", () => ({
  findOrCreateFolder: vi.fn().mockResolvedValue({ id: "drive-folder-id" }),
}));

import { getServerSession } from "next-auth";
import { eq } from "drizzle-orm";
import { POST } from "../../../src/app/api/drive/setup/route";

const mockGetServerSession = vi.mocked(getServerSession);
const mockEq = vi.mocked(eq);

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
  chain.then = (r: (v: unknown) => unknown) => Promise.resolve(undefined).then(r);
  return chain;
}

function makeUpdateChain() {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.set = self;
  chain.where = self;
  chain.then = (r: (v: unknown) => unknown) => Promise.resolve(undefined).then(r);
  return chain;
}

describe("POST /api/drive/setup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no session", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await POST();

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Not authenticated");
  });

  it("returns 401 when session has no email claim", async () => {
    mockGetServerSession.mockResolvedValueOnce({ accessToken: "tok", user: {} });

    const res = await POST();

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Session missing email");
  });

  it("includes ownerEmail in SELECT WHERE predicate (IDOR guard)", async () => {
    mockGetServerSession.mockResolvedValueOnce({
      accessToken: "tok",
      user: { email: "teacher@school.edu" },
    });
    // All folders are new — SELECT returns empty each time
    mockDbSelect.mockReturnValue(makeSelectChain([]));
    mockDbInsert.mockReturnValue(makeInsertChain());

    await POST();

    // eq() must have been called with the ownerEmail sentinel and the session email
    const eqCalls = mockEq.mock.calls as unknown[][];
    expect(eqCalls.some(([col, val]) => col === "ownerEmail" && val === "teacher@school.edu")).toBe(
      true,
    );
  });

  it("includes ownerEmail in INSERT values (fixes NULL-ownerEmail bug)", async () => {
    mockGetServerSession.mockResolvedValueOnce({
      accessToken: "tok",
      user: { email: "teacher@school.edu" },
    });
    mockDbSelect.mockReturnValue(makeSelectChain([]));

    const insertValuesArgs: unknown[] = [];
    const insertChain: Record<string, unknown> = {};
    insertChain.values = vi.fn((vals: unknown) => {
      insertValuesArgs.push(vals);
      return { then: (r: (v: unknown) => unknown) => Promise.resolve(undefined).then(r) };
    });
    mockDbInsert.mockReturnValue(insertChain);

    await POST();

    expect(insertValuesArgs.length).toBeGreaterThan(0);
    for (const vals of insertValuesArgs) {
      expect((vals as Record<string, unknown>).ownerEmail).toBe("teacher@school.edu");
    }
  });

  it("includes ownerEmail in UPDATE SET and WHERE when row already exists", async () => {
    mockGetServerSession.mockResolvedValueOnce({
      accessToken: "tok",
      user: { email: "teacher@school.edu" },
    });
    // All selects return an existing row — triggers UPDATE path
    mockDbSelect.mockReturnValue(makeSelectChain([{ id: "existing-uuid" }]));

    const updateSetArgs: unknown[] = [];
    const updateSetChain: Record<string, unknown> = {};
    updateSetChain.set = vi.fn((vals: unknown) => {
      updateSetArgs.push(vals);
      return makeUpdateChain();
    });
    mockDbUpdate.mockReturnValue(updateSetChain);

    await POST();

    expect(updateSetArgs.length).toBeGreaterThan(0);
    for (const vals of updateSetArgs) {
      expect((vals as Record<string, unknown>).ownerEmail).toBe("teacher@school.edu");
    }
    // ownerEmail must also appear in the WHERE (eq called with ownerEmail sentinel + email)
    const eqCalls = mockEq.mock.calls as unknown[][];
    expect(eqCalls.some(([col, val]) => col === "ownerEmail" && val === "teacher@school.edu")).toBe(
      true,
    );
  });

  it("returns 200 with folder map on success", async () => {
    mockGetServerSession.mockResolvedValueOnce({
      accessToken: "tok",
      user: { email: "teacher@school.edu" },
    });
    mockDbSelect.mockReturnValue(makeSelectChain([]));
    mockDbInsert.mockReturnValue(makeInsertChain());

    const res = await POST();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.folders).toBeDefined();
    expect(body.folders.root).toBe("drive-folder-id");
  });
});
