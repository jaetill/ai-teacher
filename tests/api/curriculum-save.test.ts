import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────
const { mockDbUpdate } = vi.hoisted(() => ({
  mockDbUpdate: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/db", () => ({ db: { update: mockDbUpdate } }));
vi.mock("@/db/schema", () => ({ units: {} }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

// ── Imports after mocks ──────────────────────────────────────────────────────
import { getServerSession } from "next-auth";
import { POST } from "../../src/app/api/curriculum/save/route";

const mockGetServerSession = vi.mocked(getServerSession);

function makeChain(value: unknown) {
  const p = Promise.resolve(value);
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.set = self;
  chain.where = self;
  chain.returning = self;
  chain.then = (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => p.then(r, j);
  chain.catch = (j: (e: unknown) => unknown) => p.catch(j);
  chain.finally = (fn: () => void) => p.finally(fn);
  return chain;
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/curriculum/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/curriculum/save", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 and never touches the DB when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await POST(makeRequest({ unitId: "u1", lessonPlan: "# Week 1" }));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 when unitId is missing", async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: "user-1" } });

    const res = await POST(makeRequest({ lessonPlan: "# Week 1" }));

    expect(res.status).toBe(400);
  });

  it("returns 400 when lessonPlan is missing", async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: "user-1" } });

    const res = await POST(makeRequest({ unitId: "u1" }));

    expect(res.status).toBe(400);
  });

  it("returns 404 when the unit does not exist", async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockDbUpdate.mockReturnValueOnce(makeChain([]));

    const res = await POST(makeRequest({ unitId: "missing", lessonPlan: "# Week 1" }));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Unit not found");
  });

  it("returns 200 with ok:true on a successful save", async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    mockDbUpdate.mockReturnValueOnce(makeChain([{ id: "u1" }]));

    const res = await POST(makeRequest({ unitId: "u1", lessonPlan: "# Week 1\n## Day 1" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mockDbUpdate).toHaveBeenCalledOnce();
  });
});
