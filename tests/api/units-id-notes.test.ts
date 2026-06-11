import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockWhere = vi.fn();
const mockReturning = vi.fn();

vi.mock("@/db", () => ({
  db: {
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));
vi.mock("@/db/schema", () => ({ units: {} }));
vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  eq: vi.fn((col: unknown, val: unknown) => ({ eq: [col, val] })),
}));

import { getServerSession } from "next-auth";
import { POST } from "../../src/app/api/units/[id]/notes/route";

const mockGetServerSession = vi.mocked(getServerSession);

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/units/abc/notes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/units/[id]/notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWhere.mockReturnValue({ returning: mockReturning });
    mockSet.mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });
  });

  it("returns 401 when there is no session", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await POST(makeRequest({ notes: "test" }), makeParams("abc"));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Not authenticated");
  });

  it("returns 401 when session has no email", async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: {} });

    const res = await POST(makeRequest({ notes: "test" }), makeParams("abc"));

    expect(res.status).toBe(401);
  });

  it("returns 200 when authenticated user owns the unit", async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { email: "teacher@example.com" },
    });
    mockReturning.mockResolvedValueOnce([{ id: "unit-1" }]);

    const res = await POST(makeRequest({ notes: "great lesson" }), makeParams("unit-1"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 404 when unit is not found or owned by another user", async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { email: "teacher@example.com" },
    });
    mockReturning.mockResolvedValueOnce([]);

    const res = await POST(makeRequest({ notes: "test" }), makeParams("other-unit"));

    expect(res.status).toBe(404);
  });

  it("scopes the WHERE clause to both unit id and owner email", async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { email: "teacher@example.com" },
    });
    mockReturning.mockResolvedValueOnce([{ id: "unit-1" }]);

    await POST(makeRequest({ notes: "test" }), makeParams("unit-1"));

    // The WHERE argument must include the owner's email — removing eq(units.ownerEmail, userEmail)
    // would silently revert the IDOR fix while all other tests still pass.
    const whereArg = mockWhere.mock.calls[0][0];
    const whereJson = JSON.stringify(whereArg);
    expect(whereJson).toContain("teacher@example.com");
    expect(whereJson).not.toContain("isNull");
  });
});
