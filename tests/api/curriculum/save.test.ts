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
import { POST } from "../../../src/app/api/curriculum/save/route";

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

function makeRequest(body: object = { unitId: "unit-1", lessonPlan: "# Week 1\n..." }) {
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

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 400 when unitId is missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: "teacher@example.com" }, expires: "" });

    const res = await POST(makeRequest({ lessonPlan: "# Week 1" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/unitId/);
  });

  it("returns 400 when lessonPlan is missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: "teacher@example.com" }, expires: "" });

    const res = await POST(makeRequest({ unitId: "unit-1" }));

    expect(res.status).toBe(400);
  });

  it("returns 404 when no unit is updated", async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: "teacher@example.com" }, expires: "" });
    mockDbUpdate.mockReturnValue(makeChain([]));

    const res = await POST(makeRequest());

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Unit not found");
  });

  it("returns 200 ok:true when the unit is found and updated", async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: "teacher@example.com" }, expires: "" });
    mockDbUpdate.mockReturnValue(makeChain([{ id: "unit-1" }]));

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("writes lessonPlan into aiGenerationContext.lessonPlanMarkdown", async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: "teacher@example.com" }, expires: "" });

    const updateChain = makeChain([{ id: "unit-1" }]);
    const setSpy = vi.fn().mockReturnValue(updateChain);
    updateChain.set = setSpy;
    mockDbUpdate.mockReturnValue(updateChain);

    await POST(makeRequest({ unitId: "unit-1", lessonPlan: "# My Plan" }));

    expect(setSpy).toHaveBeenCalledOnce();
    expect(setSpy.mock.calls[0][0]).toMatchObject({
      aiGenerationContext: { lessonPlanMarkdown: "# My Plan" },
    });
  });
});
