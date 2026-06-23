import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────
const { mockDbSelect } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/db", () => ({ db: { select: mockDbSelect } }));
vi.mock("@/db/schema", () => ({
  courses: {},
  units: {},
  lessons: {},
  assessments: {},
  materialAttachments: {},
  materials: {},
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  asc: vi.fn(),
  inArray: vi.fn(),
  and: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { GET } from "../../../../src/app/api/curriculum/editor/data/route";

const mockSession = vi.mocked(getServerSession);

// Drizzle chain that resolves `value` when awaited at any depth.
function makeChain(value: unknown) {
  const p = Promise.resolve(value);
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.from = self;
  chain.where = self;
  chain.orderBy = self;
  chain.limit = self;
  chain.values = self;
  chain.returning = self;
  chain.then = (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => p.then(r, j);
  chain.catch = (j: (e: unknown) => unknown) => p.catch(j);
  chain.finally = (fn: () => void) => p.finally(fn);
  return chain;
}

function makeRequest(courseId?: string) {
  const url = courseId
    ? `http://localhost/api/curriculum/editor/data?courseId=${courseId}`
    : "http://localhost/api/curriculum/editor/data";
  return new Request(url);
}

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const SESSION = { user: { email: "teacher@example.com" }, expires: "" };

describe("GET /api/curriculum/editor/data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no session", async () => {
    mockSession.mockResolvedValueOnce(null);

    const res = await GET(makeRequest(VALID_UUID));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Not authenticated");
  });

  it("returns 401 when session has no email", async () => {
    mockSession.mockResolvedValueOnce({ user: {}, expires: "" });

    const res = await GET(makeRequest(VALID_UUID));

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

  it("returns 400 when courseId is not a valid UUID", async () => {
    mockSession.mockResolvedValueOnce(SESSION);

    const res = await GET(makeRequest("not-a-uuid"));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("courseId required");
  });

  it("returns 400 for an empty courseId string", async () => {
    mockSession.mockResolvedValueOnce(SESSION);

    const res = await GET(makeRequest(""));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("courseId required");
  });

  it("returns 400 for a UUID-like string with wrong segment lengths", async () => {
    mockSession.mockResolvedValueOnce(SESSION);

    const res = await GET(makeRequest("550e8400-e29b-41d4-a716-44665544000"));

    expect(res.status).toBe(400);
  });

  it("returns 404 when owner-scope predicate excludes the course (IDOR guard)", async () => {
    mockSession.mockResolvedValueOnce(SESSION);
    mockDbSelect.mockReturnValueOnce(makeChain([]));

    const res = await GET(makeRequest(VALID_UUID));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Course not found");
  });

  describe("NULL-owner guard (issue #263)", () => {
    // Regression: if isNull() is ever re-added to the WHERE clause, the DB
    // would return NULL-owner rows. The post-query ownership assertion must
    // still reject them regardless of what the SQL returns.
    it("returns 404 when DB returns a course with ownerEmail null (pre-migration row)", async () => {
      mockSession.mockResolvedValueOnce(SESSION);
      mockDbSelect.mockReturnValueOnce(
        makeChain([{ id: VALID_UUID, ownerEmail: null, title: "ELA 8", grade: 8 }]),
      );

      const res = await GET(makeRequest(VALID_UUID));

      expect(res.status).toBe(404);
    });

    it("returns 404 when DB returns a course owned by a different user", async () => {
      mockSession.mockResolvedValueOnce(SESSION);
      mockDbSelect.mockReturnValueOnce(
        makeChain([{ id: VALID_UUID, ownerEmail: "other@example.com", title: "ELA 8", grade: 8 }]),
      );

      const res = await GET(makeRequest(VALID_UUID));

      expect(res.status).toBe(404);
    });
  });
});
