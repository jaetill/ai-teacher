import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock is hoisted — factories must not reference outer variables.
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const mockReturning = vi.fn();
const mockWhere = vi.fn(() => ({ returning: mockReturning }));
const mockSet = vi.fn(() => ({ where: mockWhere }));
const mockUpdate = vi.fn(() => ({ set: mockSet }));
vi.mock("@/db", () => ({
  db: {
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn() })) })) })),
  },
}));

vi.mock("@/db/schema", () => ({
  units: {
    id: "id",
    ownerEmail: "owner_email",
    teacherNotes: "teacher_notes",
    updatedAt: "updated_at",
  },
}));

import { getServerSession } from "next-auth";
import { db } from "@/db";
import { POST } from "../../src/app/api/units/[id]/notes/route";

const mockedGetServerSession = vi.mocked(getServerSession);

function makeParams(id = "unit-uuid-123") {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/units/unit-uuid-123/notes", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/units/[id]/notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Re-wire the chainable mock after clearAllMocks resets the inline fns
    const returning = vi.fn();
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    vi.mocked(db.update).mockReturnValue({ set } as never);

    // Store refs so tests can assert on them
    (db as { _mocks?: unknown })._mocks = { set, where, returning };
  });

  it("returns 401 when no session exists", async () => {
    mockedGetServerSession.mockResolvedValue(null);

    const res = await POST(makeRequest({ notes: "my notes" }), makeParams());

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Not authenticated");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("returns 401 when session has no email", async () => {
    mockedGetServerSession.mockResolvedValue({ user: {}, expires: "" });

    const res = await POST(makeRequest({ notes: "my notes" }), makeParams());

    expect(res.status).toBe(401);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("returns 200 when authenticated user owns the unit", async () => {
    mockedGetServerSession.mockResolvedValue({
      user: { email: "teacher@school.edu" },
      expires: "",
    });
    const mocks = (db as { _mocks?: { returning: ReturnType<typeof vi.fn> } })._mocks!;
    mocks.returning.mockResolvedValue([{ id: "unit-uuid-123" }]);

    const res = await POST(makeRequest({ notes: "lesson plan notes" }), makeParams());

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("returns 404 when unit is not found or not owned by this user", async () => {
    mockedGetServerSession.mockResolvedValue({
      user: { email: "teacher@school.edu" },
      expires: "",
    });
    const mocks = (db as { _mocks?: { returning: ReturnType<typeof vi.fn> } })._mocks!;
    mocks.returning.mockResolvedValue([]);

    const res = await POST(makeRequest({ notes: "some notes" }), makeParams("other-unit-uuid"));

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Unit not found");
  });
});
