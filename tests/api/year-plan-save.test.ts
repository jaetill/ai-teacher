import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────
const { mockDbSelect, mockDbInsert } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/db", () => ({ db: { select: mockDbSelect, insert: mockDbInsert } }));
vi.mock("@/db/schema", () => ({
  courses: {},
  units: {},
  unitStandards: {},
  standards: {},
}));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), inArray: vi.fn() }));

// ── Imports after mocks ──────────────────────────────────────────────────────
import { getServerSession } from "next-auth";
import { POST } from "../../src/app/api/year-plan/save/route";

const mockGetServerSession = vi.mocked(getServerSession);

function makeChain(value: unknown) {
  const p = Promise.resolve(value);
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.from = self;
  chain.where = self;
  chain.limit = self;
  chain.values = self;
  chain.returning = self;
  chain.then = (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => p.then(r, j);
  chain.catch = (j: (e: unknown) => unknown) => p.catch(j);
  chain.finally = (fn: () => void) => p.finally(fn);
  return chain;
}

function makeRequest() {
  return new Request("http://localhost/api/year-plan/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grade: 7,
      schoolYear: "2025-2026",
      units: [
        {
          title: "Unit 1",
          weeks: 4,
          standards: "none",
          summary: "A summary",
          anchorTexts: "A book",
          flags: "None",
        },
      ],
    }),
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/year-plan/save", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
  });

  it("returns 400 when units is missing from the body", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "user-alice" } });

    const res = await POST(
      new Request("http://localhost/api/year-plan/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grade: 6, schoolYear: "2026" }),
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("grade, schoolYear, and units are required");
  });

  it("returns 400 when units is null", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "user-alice" } });

    const res = await POST(
      new Request("http://localhost/api/year-plan/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grade: 6, schoolYear: "2026", units: null }),
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("grade, schoolYear, and units are required");
  });

  it("returns 400 when units is an empty array", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "user-alice" } });

    const res = await POST(
      new Request("http://localhost/api/year-plan/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grade: 6, schoolYear: "2026", units: [] }),
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("grade, schoolYear, and units are required");
  });

  it("returns 400 when rawPlan exceeds 50000 chars", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "user-alice" } });

    const res = await POST(
      new Request("http://localhost/api/year-plan/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grade: 7,
          schoolYear: "2025-2026",
          units: [
            {
              title: "Unit 1",
              weeks: 4,
              standards: "none",
              summary: "A summary",
              anchorTexts: "A book",
              flags: "None",
            },
          ],
          rawPlan: "x".repeat(50_001),
        }),
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("rawPlan too large");
  });

  it("sets ownerEmail on the course INSERT when no existing course is found", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-alice", email: "alice@example.com" },
    });

    // No existing course — triggers INSERT
    mockDbSelect.mockReturnValueOnce(makeChain([]));

    const courseChain = makeChain([{ id: "c1" }]);
    const courseValuesSpy = vi.fn().mockReturnValue(courseChain);
    courseChain.values = courseValuesSpy;
    mockDbInsert.mockReturnValueOnce(courseChain);

    // unit INSERT
    mockDbInsert.mockReturnValueOnce(makeChain([{ id: "u1" }]));

    await POST(makeRequest());

    expect(courseValuesSpy).toHaveBeenCalledOnce();
    expect(courseValuesSpy.mock.calls[0][0]).toMatchObject({
      ownerEmail: "alice@example.com",
    });
  });

  it("propagates session.user.id to the unit INSERT so ownership is enforced", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "user-alice" } });

    // Existing course found — no courses insert needed
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: "c1" }]));

    const unitChain = makeChain([{ id: "u1", title: "Unit 1" }]);
    const unitValuesSpy = vi.fn().mockReturnValue(unitChain);
    unitChain.values = unitValuesSpy;

    mockDbInsert.mockReturnValueOnce(unitChain);

    await POST(makeRequest());

    expect(unitValuesSpy).toHaveBeenCalledOnce();
    expect(unitValuesSpy.mock.calls[0][0]).toMatchObject({ userId: "user-alice" });
  });
});
