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

import { getServerSession } from "next-auth";
import { POST } from "../../../../src/app/api/units/[id]/notes/route";

const mockGetServerSession = vi.mocked(getServerSession);

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/units/u1/notes", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeUpdateChain(returning: unknown) {
  const p = Promise.resolve(returning);
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.set = self;
  chain.where = self;
  chain.returning = () => p;
  return chain;
}

describe("POST /api/units/[id]/notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no session", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await POST(makeRequest({ notes: "hello" }), makeParams("u1"));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Not authenticated");
  });

  it("returns 401 when session has no email claim", async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: {} });

    const res = await POST(makeRequest({ notes: "hello" }), makeParams("u1"));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Session missing email");
  });

  it("returns 404 when the unit is not found", async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { email: "teacher@school.edu" } });
    mockDbUpdate.mockReturnValueOnce(makeUpdateChain([]));

    const res = await POST(makeRequest({ notes: "my note" }), makeParams("missing"));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Unit not found");
  });

  it("returns 200 when authenticated and unit exists", async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { email: "teacher@school.edu" } });
    mockDbUpdate.mockReturnValueOnce(makeUpdateChain([{ id: "u1" }]));

    const res = await POST(makeRequest({ notes: "my note" }), makeParams("u1"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });
});
