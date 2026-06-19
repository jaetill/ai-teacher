import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────
const { mockDbSelect, mockDbInsert, mockDbUpdate, mockDbDelete } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbDelete: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/db", () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
    delete: mockDbDelete,
  },
}));
vi.mock("@/db/schema", () => ({
  courses: {},
  units: {},
  lessons: {},
  assessments: {},
  materialAttachments: {},
  materials: {},
  curriculumEditLog: {},
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  asc: vi.fn(),
  and: vi.fn(),
  inArray: vi.fn(),
}));

// ── Imports after mocks ──────────────────────────────────────────────────────
import { getServerSession } from "next-auth";
import { POST as postReorderLessons } from "../../../../src/app/api/curriculum/editor/reorder-lessons/route";
import { POST as postAttachMaterial } from "../../../../src/app/api/curriculum/editor/attach-material/route";

const mockGetServerSession = vi.mocked(getServerSession);

// ── Chain helper ─────────────────────────────────────────────────────────────
function makeChain(value: unknown) {
  const p = Promise.resolve(value);
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.from = self;
  chain.where = self;
  chain.orderBy = self;
  chain.limit = self;
  chain.values = self;
  chain.onConflictDoNothing = self;
  chain.returning = self;
  chain.set = self;
  chain.then = (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => p.then(r, j);
  chain.catch = (j: (e: unknown) => unknown) => p.catch(j);
  chain.finally = (fn: () => void) => p.finally(fn);
  return chain;
}

const SESSION_B = { user: { email: "userB@school.edu" }, expires: "" };

// ── Tests ────────────────────────────────────────────────────────────────────

describe("IDOR: editor write endpoints enforce ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/curriculum/editor/reorder-lessons", () => {
    function makeRequest(body: unknown) {
      return new Request("http://localhost/api/curriculum/editor/reorder-lessons", {
        method: "POST",
        body: JSON.stringify(body),
      });
    }

    it("returns 401 when unauthenticated", async () => {
      mockGetServerSession.mockResolvedValueOnce(null);

      const res = await postReorderLessons(makeRequest({ unitId: "u1", lessonIds: [] }));

      expect(res.status).toBe(401);
    });

    it("returns 403 when session user does not own the course", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // lessons query (current sort order for logging)
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "l1", sortOrder: 1 }]));
      // units query → returns courseId
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // ownership check → empty = not owned by user B
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postReorderLessons(makeRequest({ unitId: "u1", lessonIds: ["l1"] }));

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    });

    it("returns 404 when unit does not exist", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // lessons query
      mockDbSelect.mockReturnValueOnce(makeChain([]));
      // units query → not found
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postReorderLessons(makeRequest({ unitId: "missing", lessonIds: [] }));

      expect(res.status).toBe(404);
    });

    it("scopes each update to unitId so foreign lesson IDs cannot be mutated", async () => {
      const SESSION_A = { user: { email: "userA@school.edu" }, expires: "" };
      mockGetServerSession.mockResolvedValueOnce(SESSION_A);

      // lessons query (current sort order)
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "l1", sortOrder: 1 }]));
      // units query → courseId resolved
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // ownership check → owned by A
      mockDbSelect.mockReturnValueOnce(makeChain([{ ownerEmail: "userA@school.edu" }]));
      // log-edit select calls
      mockDbSelect.mockReturnValue(makeChain([]));
      mockDbUpdate.mockReturnValue(makeChain(undefined));
      mockDbInsert.mockReturnValue(makeChain(undefined));

      const { and: mockAnd, eq: mockEq } = await import("drizzle-orm");

      const res = await postReorderLessons(makeRequest({ unitId: "u1", lessonIds: ["l1"] }));

      expect(res.status).toBe(200);
      // `and` must be called — proves the update WHERE clause is compound (id AND unitId)
      expect(mockAnd).toHaveBeenCalled();
      // two eq() calls inside and(): one for lessons.id, one for lessons.unitId
      const eqCalls = (mockEq as ReturnType<typeof vi.fn>).mock.calls;
      const hasUnitIdScope = eqCalls.some(([_col, val]) => val === "u1");
      expect(hasUnitIdScope).toBe(true);
    });
  });

  describe("POST /api/curriculum/editor/attach-material", () => {
    function makeRequest(body: unknown) {
      return new Request("http://localhost/api/curriculum/editor/attach-material", {
        method: "POST",
        body: JSON.stringify(body),
      });
    }

    it("returns 401 when unauthenticated", async () => {
      mockGetServerSession.mockResolvedValueOnce(null);

      const res = await postAttachMaterial(
        makeRequest({ materialId: "m1", attachableType: "unit", attachableId: "u1" }),
      );

      expect(res.status).toBe(401);
    });

    it("returns 403 when session user does not own the course (unit attachable)", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // units query → courseId resolved
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // ownership check → empty = forbidden
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postAttachMaterial(
        makeRequest({ materialId: "m1", attachableType: "unit", attachableId: "u1" }),
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    });

    it("returns 404 when unit does not exist (unit attachable)", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // units query → not found
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postAttachMaterial(
        makeRequest({ materialId: "m1", attachableType: "unit", attachableId: "missing" }),
      );

      expect(res.status).toBe(404);
    });
  });
});
