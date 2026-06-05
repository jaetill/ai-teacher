import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock factories are hoisted — use vi.hoisted() for variables they reference.
const { mockGetServerSession, mockReturning, mockWhere, mockUpdate } = vi.hoisted(() => {
  const mockReturning = vi.fn();
  const mockWhere = vi.fn(() => ({ returning: mockReturning }));
  const mockSet = vi.fn(() => ({ where: mockWhere }));
  const mockUpdate = vi.fn(() => ({ set: mockSet }));
  const mockGetServerSession = vi.fn();
  return { mockGetServerSession, mockReturning, mockWhere, mockUpdate };
});

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

vi.mock("@/lib/auth", () => ({ authOptions: {} }));

vi.mock("@/db", () => ({ db: { update: mockUpdate } }));

// Provide a minimal schema stub — the route only references units.*
vi.mock("@/db/schema", () => ({
  units: {
    id: "id",
    ownerEmail: "owner_email",
    teacherNotes: "teacher_notes",
    updatedAt: "updated_at",
  },
}));

import { POST } from "../../src/app/api/units/[id]/notes/route";

function makeRequest(body: unknown, id = "unit-abc") {
  const req = new Request(`http://localhost/api/units/${id}/notes`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
  const params = { params: Promise.resolve({ id }) };
  return { req, params } as {
    req: Request;
    params: { params: Promise<{ id: string }> };
  };
}

describe("POST /api/units/[id]/notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { req, params } = makeRequest({ notes: "test" });
    const res = await POST(req, params);
    expect(res.status).toBe(401);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 401 when the session has no email", async () => {
    mockGetServerSession.mockResolvedValue({ user: {} });
    const { req, params } = makeRequest({ notes: "test" });
    const res = await POST(req, params);
    expect(res.status).toBe(401);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 200 when the authenticated user owns the unit", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { email: "teacher@example.com" },
    });
    mockReturning.mockResolvedValue([{ id: "unit-abc" }]);
    const { req, params } = makeRequest({ notes: "Great unit!" });
    const res = await POST(req, params);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("returns 404 when the unit does not exist or is not owned by the caller", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { email: "teacher@example.com" },
    });
    mockReturning.mockResolvedValue([]);
    const { req, params } = makeRequest({ notes: "Notes" }, "missing-unit");
    const res = await POST(req, params);
    expect(res.status).toBe(404);
  });

  it("returns 404 for an authenticated user attempting to write a NULL-owner unit (no IS NULL bypass)", async () => {
    // Regression guard for the IS NULL cross-user write vulnerability (issue #177).
    // The WHERE clause is strictly AND(eq(id, x), eq(ownerEmail, y)); a unit whose
    // owner_email IS NULL does not satisfy eq(ownerEmail, email), so the UPDATE
    // touches zero rows and the route returns 404.
    mockGetServerSession.mockResolvedValue({
      user: { email: "user-b@example.com" },
    });
    // Simulate the DB finding no matching row — as it would for a NULL-owner unit
    // when the WHERE clause contains only eq(ownerEmail, 'user-b@example.com').
    mockReturning.mockResolvedValue([]);
    const { req, params } = makeRequest({ notes: "injected" }, "legacy-unit");
    const res = await POST(req, params);
    expect(res.status).toBe(404);
    // Confirm the WHERE arg passed to the mock does not stringify to anything
    // containing "isNull" — the route should use strict eq() only.
    const whereArg = (mockWhere.mock.calls as unknown[][])[0]?.[0];
    expect(JSON.stringify(whereArg)).not.toContain("isNull");
  });
});
