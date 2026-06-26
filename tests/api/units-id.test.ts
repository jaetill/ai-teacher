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
}));

import { getServerSession } from "next-auth";
import { GET } from "../../src/app/api/units/[id]/route";

const mockGetServerSession = vi.mocked(getServerSession);

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

  it("returns 404 when the unit belongs to a course owned by a different user (IDOR regression)", async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { email: "other@school.edu" } });
    // unit exists in DB
    mockDbSelect.mockReturnValueOnce(
      makeSelectChain([{ id: "u1", courseId: "c1", sortOrder: 1, quarter: "Q1" }]),
    );
    // course ownership check: email doesn't match → empty result
    mockDbSelect.mockReturnValueOnce(makeSelectChain([]));

    const res = await GET(new Request("http://localhost/api/units/u1"), makeParams("u1"));

    expect(res.status).toBe(404);
    // Only two DB calls: unit lookup + ownership-scoped course lookup
    expect(mockDbSelect).toHaveBeenCalledTimes(2);
  });

  it("returns 200 with unit payload for the authenticated owner", async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { email: "owner@school.edu" } });
    // 1. unit
    mockDbSelect.mockReturnValueOnce(
      makeSelectChain([{ id: "u1", courseId: "c1", sortOrder: 1, quarter: "Q1" }]),
    );
    // 2. course (ownership match)
    mockDbSelect.mockReturnValueOnce(makeSelectChain([{ grade: 8, title: "ELA 8" }]));
    // 3. lessons (none)
    mockDbSelect.mockReturnValueOnce(makeSelectChain([]));
    // 4. unitStandards
    mockDbSelect.mockReturnValueOnce(makeSelectChain([]));
    // 5. driveFolders – curriculum key
    mockDbSelect.mockReturnValueOnce(makeSelectChain([]));
    // 6. driveFolders – quarter key
    mockDbSelect.mockReturnValueOnce(makeSelectChain([]));
    // 7. unit-level materials
    mockDbSelect.mockReturnValueOnce(makeSelectChain([]));

    const res = await GET(new Request("http://localhost/api/units/u1"), makeParams("u1"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.unit.id).toBe("u1");
    expect(body.unit.grade).toBe(8);
    expect(body.unit.courseTitle).toBe("ELA 8");
  });
});
