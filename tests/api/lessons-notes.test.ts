import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const { mockDbSelect, mockDbUpdate, mockEq, mockAnd } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockEq: vi.fn(),
  mockAnd: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/db", () => ({
  db: { select: mockDbSelect, update: mockDbUpdate },
}));
vi.mock("@/db/schema", () => ({
  lessons: {
    id: "lessons.id",
    unitId: "lessons.unitId",
    teacherNotes: "lessons.teacherNotes",
    updatedAt: "lessons.updatedAt",
  },
  units: { id: "units.id", courseId: "units.courseId" },
  courses: { id: "courses.id", ownerEmail: "courses.ownerEmail" },
}));
vi.mock("drizzle-orm", () => ({ eq: mockEq, and: mockAnd }));

// ── Imports after mocks ───────────────────────────────────────────────────────
import { getServerSession } from "next-auth";
import { POST } from "../../src/app/api/lessons/[id]/notes/route";
import { courses } from "@/db/schema";

const mockGetServerSession = vi.mocked(getServerSession);

// ── Chain helper ──────────────────────────────────────────────────────────────
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

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/lessons/lesson-1/notes", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const SESSION = { user: { email: "teacher@example.com" }, expires: "" };
const PARAMS = { params: Promise.resolve({ id: "lesson-1" }) };

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("POST /api/lessons/[id]/notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await POST(makeRequest({ notes: "test" }), PARAMS);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Not authenticated");
  });

  it("returns 401 when session has no email", async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: {}, expires: "" });

    const res = await POST(makeRequest({ notes: "test" }), PARAMS);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Session missing email");
  });

  it("returns 400 on malformed JSON body", async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);

    const req = new Request("http://localhost/api/lessons/lesson-1/notes", {
      method: "POST",
      body: "not-json",
    });

    const res = await POST(req, PARAMS);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid JSON");
  });

  it("returns 400 when notes field is missing", async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);

    const res = await POST(makeRequest({}), PARAMS);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid notes");
  });

  it("returns 400 when notes is not a string", async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);

    const res = await POST(makeRequest({ notes: 42 }), PARAMS);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid notes");
  });

  it("returns 400 when notes exceeds 50 000 characters", async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);

    const res = await POST(makeRequest({ notes: "x".repeat(50_001) }), PARAMS);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid notes");
  });

  it("returns 404 when lesson does not exist", async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    // lessons query → not found
    mockDbSelect.mockReturnValueOnce(makeChain([]));

    const res = await POST(makeRequest({ notes: "test" }), {
      params: Promise.resolve({ id: "missing-id" }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Lesson not found");
  });

  it("returns 403 when lesson belongs to a different user", async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    // lessons query → found
    mockDbSelect.mockReturnValueOnce(makeChain([{ unitId: "unit-of-other" }]));
    // units query → found, resolves courseId
    mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-other" }]));
    // assertCourseOwnership → empty = not owned by session user
    mockDbSelect.mockReturnValueOnce(makeChain([]));

    const res = await POST(makeRequest({ notes: "injected" }), PARAMS);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 200 and updates notes when session user owns the course", async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    // lessons query → found
    mockDbSelect.mockReturnValueOnce(makeChain([{ unitId: "unit-1" }]));
    // units query → found, resolves courseId
    mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-1" }]));
    // assertCourseOwnership → owned (returns course row)
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: "course-1" }]));
    // UPDATE returning
    mockDbUpdate.mockReturnValueOnce(makeChain([{ id: "lesson-1" }]));

    const res = await POST(makeRequest({ notes: "Great class today!" }), PARAMS);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    // Ownership predicate guard: if eq(courses.ownerEmail, email) is removed from the
    // WHERE clause in assertCourseOwnership, this assertion fails — catching a silent
    // IDOR regression even though the mock-controlled 403/200 split would still pass.
    expect(mockEq).toHaveBeenCalledWith(courses.ownerEmail, "teacher@example.com");
  });
});
