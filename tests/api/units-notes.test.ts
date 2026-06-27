import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────
const { mockDbSelect, mockDbUpdate } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/db", () => ({ db: { select: mockDbSelect, update: mockDbUpdate } }));
vi.mock("@/db/schema", () => ({ units: {}, courses: {} }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn() }));

import { getServerSession } from "next-auth";
import { POST } from "../../src/app/api/units/[id]/notes/route";

const mockGetServerSession = vi.mocked(getServerSession);

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(notes = "some notes") {
  return new Request("http://localhost/api/units/u1/notes", {
    method: "POST",
    body: JSON.stringify({ notes }),
  });
}

function makeChain(value: unknown) {
  const p = Promise.resolve(value);
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.from = self;
  chain.where = self;
  chain.limit = self;
  chain.set = self;
  chain.returning = self;
  chain.then = (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => p.then(r, j);
  chain.catch = (j: (e: unknown) => unknown) => p.catch(j);
  chain.finally = (fn: () => void) => p.finally(fn);
  return chain;
}

describe("POST /api/units/[id]/notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no session", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await POST(makeRequest(), makeParams("u1"));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Not authenticated");
  });

  it("returns 401 when session has no email", async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: {} });

    const res = await POST(makeRequest(), makeParams("u1"));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Not authenticated");
  });

  it("returns 404 when unit does not exist", async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { email: "teacher@school.edu" } });
    // unit lookup → not found
    mockDbSelect.mockReturnValueOnce(makeChain([]));

    const res = await POST(makeRequest(), makeParams("missing"));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Unit not found");
  });

  it("returns 403 when session user does not own the course", async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { email: "other@school.edu" } });
    // unit lookup → found, resolves courseId
    mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
    // assertCourseOwnership: courses query → empty (other@school.edu is not the owner)
    mockDbSelect.mockReturnValueOnce(makeChain([]));

    const res = await POST(makeRequest(), makeParams("u1"));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 200 and saves notes for the authenticated owner", async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { email: "teacher@school.edu" } });
    // unit lookup → found
    mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-1" }]));
    // assertCourseOwnership → owned
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: "course-1" }]));
    // update → success
    mockDbUpdate.mockReturnValueOnce(makeChain([{ id: "u1" }]));

    const res = await POST(makeRequest("new notes"), makeParams("u1"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(mockDbUpdate).toHaveBeenCalledOnce();
  });
});
