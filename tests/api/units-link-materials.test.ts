import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const { mockDbSelect } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/db", () => ({ db: { select: mockDbSelect } }));
vi.mock("@/db/schema", () => ({
  units: {},
  lessons: {},
  materials: {},
  materialAttachments: {},
  // ownerEmail sentinel distinct from courses so find() matches only driveFolders calls
  driveFolders: { folderKey: "folderKey", driveId: "driveId", ownerEmail: "ownerEmail" },
  courses: {},
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  or: vi.fn(),
  isNull: vi.fn(),
  inArray: vi.fn(),
  asc: vi.fn(),
}));
// Prevent real SDK instantiation at module load time
vi.mock("@anthropic-ai/sdk", () => ({
  default: class Anthropic {
    messages = { create: () => Promise.resolve() };
  },
}));
vi.mock("@/lib/material-roles", () => ({
  normalizeMaterialRole: vi.fn((r: string) => r),
}));

import { getServerSession } from "next-auth";
import { eq } from "drizzle-orm";
import { POST } from "../../src/app/api/units/[id]/link-materials/route";

const mockGetServerSession = vi.mocked(getServerSession);
const mockEq = vi.mocked(eq);

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeSelectChain(resolvedValue: unknown) {
  const p = Promise.resolve(resolvedValue);
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.from = self;
  chain.where = self;
  chain.orderBy = self;
  chain.limit = self;
  chain.innerJoin = self;
  chain.then = (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => p.then(r, j);
  chain.catch = (j: (e: unknown) => unknown) => p.catch(j);
  chain.finally = (fn: () => void) => p.finally(fn);
  return chain;
}

const SESSION = { accessToken: "tok", user: { email: "teacher@school.edu" }, expires: "" };

describe("POST /api/units/[id]/link-materials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no session", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await POST(
      new Request("http://localhost/api/units/u1/link-materials"),
      makeParams("u1"),
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Not authenticated");
  });

  it("returns 401 when session has no email", async () => {
    mockGetServerSession.mockResolvedValueOnce({ accessToken: "tok", user: {}, expires: "" });

    const res = await POST(
      new Request("http://localhost/api/units/u1/link-materials"),
      makeParams("u1"),
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Session missing email");
  });

  it("returns 404 when unit is not found", async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockDbSelect.mockReturnValueOnce(makeSelectChain([])); // units → empty

    const res = await POST(
      new Request("http://localhost/api/units/u1/link-materials"),
      makeParams("u1"),
    );

    expect(res.status).toBe(404);
  });

  it("scopes driveFolders query by ownerEmail to prevent cross-user IDOR", async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    // 1. unit found
    mockDbSelect.mockReturnValueOnce(
      makeSelectChain([{ id: "u1", courseId: "c1", sortOrder: 1, quarter: "Q1", title: "Unit 1" }]),
    );
    // 2. course found (grade needed to build folder keys)
    mockDbSelect.mockReturnValueOnce(makeSelectChain([{ grade: 8 }]));
    // 3. lessons — at least one so route doesn't return 400 before the ownership check
    mockDbSelect.mockReturnValueOnce(
      makeSelectChain([{ id: "l1", title: "Lesson 1", sortOrder: 1 }]),
    );
    // 4. assertCourseOwnership internal DB call — course owned by session user
    mockDbSelect.mockReturnValueOnce(makeSelectChain([{ id: "c1" }]));
    // 5. driveFolders → empty; triggers 400 but eq predicate is already recorded
    mockDbSelect.mockReturnValueOnce(makeSelectChain([]));

    await POST(new Request("http://localhost/api/units/u1/link-materials"), makeParams("u1"));

    // courses: {} means courses.ownerEmail is undefined, so the find below matches
    // only the driveFolders.ownerEmail sentinel — no ambiguity with assertCourseOwnership.
    const eqCalls = mockEq.mock.calls as [unknown, unknown][];
    const ownerEmailCall = eqCalls.find(([col]) => col === "ownerEmail");
    expect(ownerEmailCall).toBeDefined();
    expect(ownerEmailCall![1]).toBe("teacher@school.edu");
  });

  it("does not leak Drive folder IDs belonging to a different user", async () => {
    // Verifies that the ownerEmail predicate always uses the authenticated session's
    // email — a hardcoded or cross-user email would expose another user's folders.
    const otherSession = { accessToken: "tok", user: { email: "victim@school.edu" }, expires: "" };
    mockGetServerSession.mockResolvedValueOnce(otherSession);
    mockDbSelect.mockReturnValueOnce(
      makeSelectChain([{ id: "u1", courseId: "c1", sortOrder: 1, quarter: "Q1", title: "Unit 1" }]),
    );
    mockDbSelect.mockReturnValueOnce(makeSelectChain([{ grade: 8 }]));
    mockDbSelect.mockReturnValueOnce(
      makeSelectChain([{ id: "l1", title: "Lesson 1", sortOrder: 1 }]),
    );
    mockDbSelect.mockReturnValueOnce(makeSelectChain([{ id: "c1" }]));
    mockDbSelect.mockReturnValueOnce(makeSelectChain([]));

    await POST(new Request("http://localhost/api/units/u1/link-materials"), makeParams("u1"));

    const eqCalls = mockEq.mock.calls as [unknown, unknown][];
    const ownerEmailCall = eqCalls.find(([col]) => col === "ownerEmail");
    expect(ownerEmailCall).toBeDefined();
    // Must be scoped to the authenticated session's email, not any other user's
    expect(ownerEmailCall![1]).toBe("victim@school.edu");
    expect(ownerEmailCall![1]).not.toBe("teacher@school.edu");
  });
});
