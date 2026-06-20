import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────
const { mockDbSelect, mockDbInsert, mockMessagesCreate } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockMessagesCreate: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/db", () => ({ db: { select: mockDbSelect, insert: mockDbInsert } }));
vi.mock("@/db/schema", () => ({
  units: {},
  lessons: {},
  unitStandards: {},
  standards: {},
  lessonStandards: {},
}));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), asc: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: mockMessagesCreate };
  },
}));

// ── Imports after mocks ──────────────────────────────────────────────────────
import { getServerSession } from "next-auth";
import { POST } from "../../src/app/api/units/[id]/infer-standards/route";

const mockGetServerSession = vi.mocked(getServerSession);

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
  chain.innerJoin = self;
  chain.values = self;
  chain.onConflictDoNothing = self;
  chain.then = (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => p.then(r, j);
  chain.catch = (j: (e: unknown) => unknown) => p.catch(j);
  chain.finally = (fn: () => void) => p.finally(fn);
  return chain;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/units/[id]/infer-standards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await POST(
      new Request("http://localhost/api/units/unit-1/infer-standards", { method: "POST" }),
      makeParams("unit-1"),
    );

    expect(res.status).toBe(401);
  });

  it("does not call Anthropic when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    await POST(
      new Request("http://localhost/api/units/unit-1/infer-standards", { method: "POST" }),
      makeParams("unit-1"),
    );

    expect(mockMessagesCreate).not.toHaveBeenCalled();
  });

  it("returns 403 when authenticated user does not own the unit", async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: "google-sub-alice" } });

    // unit owned by a different user
    mockDbSelect.mockReturnValueOnce(
      makeChain([{ id: "unit-1", title: "Owned Unit", userId: "google-sub-bob" }]),
    );

    const res = await POST(
      new Request("http://localhost/api/units/unit-1/infer-standards", { method: "POST" }),
      makeParams("unit-1"),
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("allows any authenticated user when unit.userId is null (legacy row)", async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: "google-sub-alice" } });

    // unit has no owner (pre-auth row)
    mockDbSelect.mockReturnValueOnce(
      makeChain([{ id: "unit-1", title: "Legacy Unit", userId: null }]),
    );
    // lessons and standards queries return empty → 400, not 403
    mockDbSelect.mockReturnValue(makeChain([]));

    const res = await POST(
      new Request("http://localhost/api/units/unit-1/infer-standards", { method: "POST" }),
      makeParams("unit-1"),
    );

    expect(res.status).not.toBe(403);
  });
});
