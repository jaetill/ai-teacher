import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const { mockDbSelect } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/db", () => ({ db: { select: mockDbSelect } }));
vi.mock("@/db/schema", () => ({
  materials: {},
  materialAttachments: {},
  units: {},
  driveFolders: {},
  courses: {},
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  inArray: vi.fn(),
  sql: vi.fn(),
  and: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { GET } from "../../../../src/app/api/curriculum/editor/pool/route";

const mockSession = vi.mocked(getServerSession);

function makeChain(value: unknown) {
  const p = Promise.resolve(value);
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.from = self;
  chain.where = self;
  chain.limit = self;
  chain.then = (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => p.then(r, j);
  chain.catch = (j: (e: unknown) => unknown) => p.catch(j);
  chain.finally = (fn: () => void) => p.finally(fn);
  return chain;
}

function makeRequest(courseId?: string) {
  const url = courseId
    ? `http://localhost/api/curriculum/editor/pool?courseId=${courseId}`
    : "http://localhost/api/curriculum/editor/pool";
  return new Request(url);
}

const COURSE_ID = "550e8400-e29b-41d4-a716-446655440000";
const SESSION = { user: { email: "teacher@example.com" }, expires: "" };

describe("GET /api/curriculum/editor/pool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no session", async () => {
    mockSession.mockResolvedValueOnce(null);

    const res = await GET(makeRequest(COURSE_ID));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Not authenticated");
  });

  it("returns 401 when session has no email", async () => {
    mockSession.mockResolvedValueOnce({ user: {}, expires: "" });

    const res = await GET(makeRequest(COURSE_ID));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Not authenticated");
  });

  it("returns 400 when courseId is missing", async () => {
    mockSession.mockResolvedValueOnce(SESSION);

    const res = await GET(makeRequest());

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("courseId required");
  });

  it("returns 403 when session user does not own the course (IDOR guard)", async () => {
    mockSession.mockResolvedValueOnce(SESSION);
    // assertCourseOwnership → empty = not owned by this user
    mockDbSelect.mockReturnValueOnce(makeChain([]));

    const res = await GET(makeRequest(COURSE_ID));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns empty materials list when course has no units", async () => {
    mockSession.mockResolvedValueOnce(SESSION);
    // assertCourseOwnership → course owned by this user
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: COURSE_ID }]));
    // courseUnits query → no units for this course
    mockDbSelect.mockReturnValueOnce(makeChain([]));

    const res = await GET(makeRequest(COURSE_ID));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.materials).toEqual([]);
  });
});
