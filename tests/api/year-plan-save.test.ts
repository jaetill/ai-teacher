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
