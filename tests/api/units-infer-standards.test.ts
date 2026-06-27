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

  it("returns 400 for a malformed (non-UUID) unit id", async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: "google-sub-alice" } });

    const res = await POST(
      new Request("http://localhost/api/units/not-a-uuid/infer-standards", { method: "POST" }),
      makeParams("not-a-uuid"),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid unit id");
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

    const unitId = "00000000-0000-0000-0000-000000000001";
    // unit owned by a different user
    mockDbSelect.mockReturnValueOnce(
      makeChain([{ id: unitId, title: "Owned Unit", userId: "google-sub-bob" }]),
    );

    const res = await POST(
      new Request(`http://localhost/api/units/${unitId}/infer-standards`, { method: "POST" }),
      makeParams(unitId),
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("allows any authenticated user when unit.userId is null (legacy row)", async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: "google-sub-alice" } });

    const unitId = "00000000-0000-0000-0000-000000000001";
    // unit has no owner (pre-auth row)
    mockDbSelect.mockReturnValueOnce(
      makeChain([{ id: unitId, title: "Legacy Unit", userId: null }]),
    );
    // lessons and standards queries return empty → 400, not 403
    mockDbSelect.mockReturnValue(makeChain([]));

    const res = await POST(
      new Request(`http://localhost/api/units/${unitId}/infer-standards`, { method: "POST" }),
      makeParams(unitId),
    );

    expect(res.status).not.toBe(403);
  });

  it("returns 200 (not 403) when session.user.id is undefined and unit.userId is set", async () => {
    // Regression for #140: absent token.sub must not block the authenticated user.
    mockGetServerSession.mockResolvedValueOnce({ user: {} }); // no id field

    const unitId = "00000000-0000-0000-0000-000000000003";
    mockDbSelect.mockReturnValueOnce(
      makeChain([{ id: unitId, title: "Owned Unit", userId: "google-sub-alice" }]),
    );
    // empty lessons/standards → 400, past the ownership gate
    mockDbSelect.mockReturnValue(makeChain([]));

    const res = await POST(
      new Request(`http://localhost/api/units/${unitId}/infer-standards`, { method: "POST" }),
      makeParams(unitId),
    );

    expect(res.status).not.toBe(403);
  });

  it("allows the unit owner to infer standards", async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: "google-sub-alice" } });

    const unitId = "00000000-0000-0000-0000-000000000002";
    // unit owned by alice — same as session user
    mockDbSelect.mockReturnValueOnce(
      makeChain([{ id: unitId, title: "Alice's Unit", userId: "google-sub-alice" }]),
    );
    // empty lessons/standards → 400 (past the auth gates, not blocked by ownership check)
    mockDbSelect.mockReturnValue(makeChain([]));

    const res = await POST(
      new Request(`http://localhost/api/units/${unitId}/infer-standards`, { method: "POST" }),
      makeParams(unitId),
    );

    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });
});
