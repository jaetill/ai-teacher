import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────
const { mockDbUpdate, mockDbSelect, mockAssert } = vi.hoisted(() => ({
  mockDbUpdate: vi.fn(),
  mockDbSelect: vi.fn(),
  mockAssert: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/db", () => ({ db: { update: mockDbUpdate, select: mockDbSelect } }));
vi.mock("@/db/schema", () => ({ units: { id: "id", courseId: "courseId" } }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));
vi.mock("@/app/api/curriculum/editor/assert-ownership", () => ({
  assertCourseOwnership: mockAssert,
}));

// ── Imports after mocks ──────────────────────────────────────────────────────
import { getServerSession } from "next-auth";
import { POST } from "../../../src/app/api/curriculum/save/route";

const mockGetServerSession = vi.mocked(getServerSession);

// Thenable chain supporting both the select (from/where/limit) and update
// (set/where/returning) builder shapes.
function makeChain(value: unknown) {
  const p = Promise.resolve(value);
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.set = self;
  chain.from = self;
  chain.where = self;
  chain.limit = self;
  chain.returning = self;
  chain.then = (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => p.then(r, j);
  chain.catch = (j: (e: unknown) => unknown) => p.catch(j);
  chain.finally = (fn: () => void) => p.finally(fn);
  return chain;
}

function authed() {
  mockGetServerSession.mockResolvedValue({
    user: { email: "teacher@example.com" },
    expires: "",
  });
}

// Default: unit exists and is owned by the caller.
function ownsUnit() {
  mockDbSelect.mockReturnValue(makeChain([{ courseId: "course-1" }]));
  mockAssert.mockResolvedValue(null);
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
    expect((await res.json()).error).toBe("Unauthorized");
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it("returns 401 when the session has no email", async () => {
    mockGetServerSession.mockResolvedValue({ user: {}, expires: "" });
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it("returns 400 when unitId is missing", async () => {
    authed();
    const res = await POST(makeRequest({ lessonPlan: "# Week 1" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/unitId/);
  });

  it("returns 400 when lessonPlan is missing", async () => {
    authed();
    const res = await POST(makeRequest({ unitId: "unit-1" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the unit does not exist", async () => {
    authed();
    mockDbSelect.mockReturnValue(makeChain([]));
    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Unit not found");
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("returns 403 (and never updates) when the caller does not own the unit's course", async () => {
    authed();
    mockDbSelect.mockReturnValue(makeChain([{ courseId: "course-1" }]));
    mockAssert.mockResolvedValue(
      Response.json({ error: "Forbidden" }, { status: 403 })
    );
    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
    expect(mockAssert).toHaveBeenCalledWith("course-1", "teacher@example.com");
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("returns 200 ok:true when the unit is owned and updated", async () => {
    authed();
    ownsUnit();
    mockDbUpdate.mockReturnValue(makeChain([{ id: "unit-1" }]));
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it("writes lessonPlan into aiGenerationContext.lessonPlanMarkdown", async () => {
    authed();
    ownsUnit();
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
