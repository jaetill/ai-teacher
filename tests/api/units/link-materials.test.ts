import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const { mockDbSelect, mockEq, mockAnd } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockEq: vi.fn((col, val) => ({ col, val })),
  mockAnd: vi.fn((...args) => ({ and: args })),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/db", () => ({ db: { select: mockDbSelect } }));
vi.mock("@/db/schema", () => ({
  units: {},
  lessons: {},
  materials: {},
  materialAttachments: {},
  driveFolders: { ownerEmail: "ownerEmail", folderKey: "folderKey", driveId: "driveId" },
  courses: {},
}));
vi.mock("drizzle-orm", () => ({
  eq: mockEq,
  and: mockAnd,
  asc: vi.fn(),
  inArray: vi.fn((col, vals) => ({ col, vals })),
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: vi.fn() };
  },
}));

import { getServerSession } from "next-auth";
import { POST } from "../../../src/app/api/units/[id]/link-materials/route";

const mockSession = vi.mocked(getServerSession);

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeChain(value: unknown) {
  const p = Promise.resolve(value);
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.from = self;
  chain.where = self;
  chain.orderBy = self;
  chain.limit = self;
  chain.then = (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => p.then(r, j);
  chain.catch = (j: (e: unknown) => unknown) => p.catch(j);
  chain.finally = (fn: () => void) => p.finally(fn);
  return chain;
}

const SESSION = { accessToken: "tok", user: { email: "teacher@example.com" }, expires: "" };
const UNIT = { id: "u1", courseId: "c1", sortOrder: 1, quarter: "Q1", title: "Unit 1" };

describe("POST /api/units/[id]/link-materials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no session", async () => {
    mockSession.mockResolvedValueOnce(null);

    const res = await POST(new Request("http://localhost"), makeParams("u1"));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Not authenticated");
  });

  it("returns 401 when session has no email", async () => {
    mockSession.mockResolvedValueOnce({ accessToken: "tok", user: {}, expires: "" });

    const res = await POST(new Request("http://localhost"), makeParams("u1"));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Session missing email");
  });

  it("returns 404 when unit is not found", async () => {
    mockSession.mockResolvedValueOnce(SESSION);
    mockDbSelect.mockReturnValueOnce(makeChain([]));

    const res = await POST(new Request("http://localhost"), makeParams("u1"));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Unit not found");
  });

  it("scopes driveFolders query by ownerEmail (IDOR guard)", async () => {
    mockSession.mockResolvedValueOnce(SESSION);
    // 1. unit lookup
    mockDbSelect.mockReturnValueOnce(makeChain([UNIT]));
    // 2. course lookup
    mockDbSelect.mockReturnValueOnce(makeChain([{ grade: 8 }]));
    // 3. lessons lookup
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: "l1", title: "Lesson 1", sortOrder: 1 }]));
    // 4. driveFolders lookup — returns empty to trigger the 400 early exit
    mockDbSelect.mockReturnValueOnce(makeChain([]));

    const res = await POST(new Request("http://localhost"), makeParams("u1"));

    // Empty folders → 400, which is the early-exit we rely on to avoid mocking Anthropic
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("No Drive folders found");

    // The driveFolders WHERE clause must include eq(driveFolders.ownerEmail, sessionEmail).
    // A future removal of this predicate would allow cross-user folder access (IDOR).
    const ownerEmailCalls = mockEq.mock.calls.filter(([col]) => col === "ownerEmail");
    expect(ownerEmailCalls).toHaveLength(1);
    expect(ownerEmailCalls[0][1]).toBe("teacher@example.com");
  });

  it("does not return folders belonging to a different user's email", async () => {
    // Two sessions with different emails. Only the session email should scope the query.
    mockSession.mockResolvedValueOnce({
      accessToken: "tok",
      user: { email: "attacker@example.com" },
      expires: "",
    });
    mockDbSelect.mockReturnValueOnce(makeChain([UNIT]));
    mockDbSelect.mockReturnValueOnce(makeChain([{ grade: 8 }]));
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: "l1", title: "Lesson 1", sortOrder: 1 }]));
    // Attacker gets no folders because their email doesn't match the victim's rows
    mockDbSelect.mockReturnValueOnce(makeChain([]));

    const res = await POST(new Request("http://localhost"), makeParams("u1"));

    expect(res.status).toBe(400);

    const ownerEmailCalls = mockEq.mock.calls.filter(([col]) => col === "ownerEmail");
    expect(ownerEmailCalls).toHaveLength(1);
    // Must be scoped to attacker's email — never the victim's
    expect(ownerEmailCalls[0][1]).toBe("attacker@example.com");
    expect(ownerEmailCalls[0][1]).not.toBe("teacher@example.com");
  });
});
