import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────
const { mockDbSelect } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/db", () => ({ db: { select: mockDbSelect } }));
vi.mock("@/db/schema", () => ({ courses: {}, units: {}, schoolYears: {} }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), asc: vi.fn(), inArray: vi.fn() }));

// ── Imports after mocks ──────────────────────────────────────────────────────
import { getServerSession } from "next-auth";
import { GET } from "../../src/app/api/courses/route";

const mockGetServerSession = vi.mocked(getServerSession);

function makeSelectChain(resolvedValue: unknown) {
  const p = Promise.resolve(resolvedValue);
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

describe("GET /api/courses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no session", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await GET();

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Not authenticated");
  });

  it("returns 401 when session has no email claim", async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: {} });

    const res = await GET();

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Session missing email");
  });

  it("returns only the authenticated owner's courses", async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { email: "owner@school.edu" },
    });

    // schoolYears → courses → units
    mockDbSelect.mockReturnValueOnce(makeSelectChain([{ name: "2024-2025" }]));
    mockDbSelect.mockReturnValueOnce(
      makeSelectChain([{ id: "c1", ownerEmail: "owner@school.edu", grade: 8, title: "ELA 8" }]),
    );
    mockDbSelect.mockReturnValueOnce(
      makeSelectChain([{ id: "u1", courseId: "c1", title: "Unit 1", sortOrder: 1 }]),
    );

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.schoolYear).toBe("2024-2025");
    expect(body.courses).toHaveLength(1);
    expect(body.courses[0].id).toBe("c1");
    expect(body.courses[0].units).toHaveLength(1);
    expect(body.courses[0].units[0].id).toBe("u1");
  });

  it("returns empty courses list for a different authenticated user (IDOR regression check)", async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { email: "other@school.edu" },
    });

    mockDbSelect.mockReturnValueOnce(makeSelectChain([])); // schoolYears
    mockDbSelect.mockReturnValueOnce(makeSelectChain([])); // courses — ownerEmail filter returns nothing

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.courses).toEqual([]);
  });

  it("skips the units DB query when owner has no courses", async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { email: "owner@school.edu" },
    });

    mockDbSelect.mockReturnValueOnce(makeSelectChain([{ name: "2024-2025" }]));
    mockDbSelect.mockReturnValueOnce(makeSelectChain([])); // no courses

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.courses).toEqual([]);
    // Only schoolYears + courses queries; units was short-circuited
    expect(mockDbSelect).toHaveBeenCalledTimes(2);
  });
});
