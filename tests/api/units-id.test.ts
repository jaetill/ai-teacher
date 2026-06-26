import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────
const { mockDbSelect } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/db", () => ({ db: { select: mockDbSelect } }));
vi.mock("@/db/schema", () => ({
  units: {},
  lessons: {},
  unitStandards: {},
  lessonStandards: {},
  standards: {},
  courses: {},
  driveFolders: {},
  materials: {},
  materialAttachments: {},
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  asc: vi.fn(),
  inArray: vi.fn(),
  and: vi.fn(),
  or: vi.fn(),
  isNull: vi.fn(),
}));

// ── Imports after mocks ──────────────────────────────────────────────────────
import { getServerSession } from "next-auth";
import { eq } from "drizzle-orm";
import { GET } from "../../src/app/api/units/[id]/route";

const mockGetServerSession = vi.mocked(getServerSession);
const mockEq = vi.mocked(eq);

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

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// 7 DB calls when the unit has no lessons:
// 1. units  2. courses (with ownership)  3. lessons  4. unitStandards
// 5. driveFolders (curriculum)  6. driveFolders (quarter)  7. materialAttachments (unit-level)
function mockFullChain(unit: Record<string, unknown>, course: Record<string, unknown>) {
  mockDbSelect
    .mockReturnValueOnce(makeSelectChain([unit]))
    .mockReturnValueOnce(makeSelectChain([course]))
    .mockReturnValueOnce(makeSelectChain([]))
    .mockReturnValueOnce(makeSelectChain([]))
    .mockReturnValueOnce(makeSelectChain([]))
    .mockReturnValueOnce(makeSelectChain([]))
    .mockReturnValueOnce(makeSelectChain([]));
}

describe("GET /api/units/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no session", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await GET(new Request("http://localhost/api/units/abc"), makeParams("abc"));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Not authenticated");
  });

  it("returns 401 when session has no email claim", async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: {} });

    const res = await GET(new Request("http://localhost/api/units/abc"), makeParams("abc"));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Session missing email");
  });

  it("returns 404 when unit does not exist", async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { email: "owner@school.edu" },
    });
    mockDbSelect.mockReturnValueOnce(makeSelectChain([])); // units: not found

    const res = await GET(new Request("http://localhost/api/units/missing"), makeParams("missing"));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Unit not found");
  });

  it("returns 404 when course is owned by a different user (IDOR guard)", async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { email: "attacker@evil.com" },
    });
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([{ id: "u1", courseId: "c1", sortOrder: 1 }])) // unit found
      .mockReturnValueOnce(makeSelectChain([])); // course: ownership predicate excludes it

    const res = await GET(new Request("http://localhost/api/units/u1"), makeParams("u1"));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Unit not found");
    // Ownership predicate was applied: eq was called with the attacker's email
    expect(mockEq.mock.calls.some(([, v]) => v === "attacker@evil.com")).toBe(true);
  });

  it("returns 200 for the authenticated owner (happy path)", async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { email: "owner@school.edu" },
    });
    mockFullChain(
      { id: "u1", courseId: "c1", sortOrder: 1, quarter: "Q1" },
      { grade: 8, title: "ELA 8" },
    );

    const res = await GET(new Request("http://localhost/api/units/u1"), makeParams("u1"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.unit).toBeDefined();
    expect(body.unit.grade).toBe(8);
    // Ownership predicate was applied with the correct owner email
    expect(mockEq.mock.calls.some(([, v]) => v === "owner@school.edu")).toBe(true);
  });
});
