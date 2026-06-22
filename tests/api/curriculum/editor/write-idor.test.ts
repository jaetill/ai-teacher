import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────
const { mockDbSelect, mockDbInsert, mockDbUpdate, mockDbDelete, mockDbTransaction } = vi.hoisted(
  () => ({
    mockDbSelect: vi.fn(),
    mockDbInsert: vi.fn(),
    mockDbUpdate: vi.fn(),
    mockDbDelete: vi.fn(),
    mockDbTransaction: vi.fn(),
  }),
);

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/db", () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
    delete: mockDbDelete,
    transaction: mockDbTransaction,
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
  sql: vi.fn(),
  gt: vi.fn(),
  gte: vi.fn(),
}));

// ── Imports after mocks ──────────────────────────────────────────────────────
import { getServerSession } from "next-auth";
import { POST as postReorderLessons } from "../../../../src/app/api/curriculum/editor/reorder-lessons/route";
import { POST as postAttachMaterial } from "../../../../src/app/api/curriculum/editor/attach-material/route";
import { POST as postDetachMaterial } from "../../../../src/app/api/curriculum/editor/detach-material/route";
import { POST as postRetypeContent } from "../../../../src/app/api/curriculum/editor/retype-content/route";
import { POST as postUpdateItem } from "../../../../src/app/api/curriculum/editor/update-item/route";
import { POST as postUpdateMaterial } from "../../../../src/app/api/curriculum/editor/update-material/route";
import { POST as postMoveLesson } from "../../../../src/app/api/curriculum/editor/move-lesson/route";
import { POST as postMoveAssessment } from "../../../../src/app/api/curriculum/editor/move-assessment/route";

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

      const { and: mockAnd } = await import("drizzle-orm");

      const res = await postReorderLessons(makeRequest({ unitId: "u1", lessonIds: ["l1"] }));

      expect(res.status).toBe(200);
      // assertCourseOwnership contributes 1 and(); the UPDATE loop adds 1 per lessonId.
      // Reverting the UPDATE WHERE to plain eq(lessons.id, ...) drops this to 1, failing here.
      expect(mockAnd).toHaveBeenCalledTimes(2);
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

    it("returns 404 when unit is not found (lesson attachable)", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // lessons query → found
      mockDbSelect.mockReturnValueOnce(makeChain([{ unitId: "u-deleted" }]));
      // units query → orphaned FK, unit deleted
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postAttachMaterial(
        makeRequest({ materialId: "m1", attachableType: "lesson", attachableId: "l1" }),
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Unit not found");
    });

    it("returns 404 when unit is not found (assessment attachable)", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // assessments query → found
      mockDbSelect.mockReturnValueOnce(makeChain([{ unitId: "u-deleted" }]));
      // units query → orphaned FK, unit deleted
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postAttachMaterial(
        makeRequest({ materialId: "m1", attachableType: "assessment", attachableId: "a1" }),
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Unit not found");
    });
  });

  describe("POST /api/curriculum/editor/detach-material", () => {
    function makeRequest(body: unknown) {
      return new Request("http://localhost/api/curriculum/editor/detach-material", {
        method: "POST",
        body: JSON.stringify(body),
      });
    }

    it("returns 401 when unauthenticated", async () => {
      mockGetServerSession.mockResolvedValueOnce(null);

      const res = await postDetachMaterial(makeRequest({ materialAttachmentId: "a1" }));

      expect(res.status).toBe(401);
    });

    it("returns 403 when session user does not own the course", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // materialAttachments query → found, attachableType "unit"
      mockDbSelect.mockReturnValueOnce(
        makeChain([
          {
            id: "a1",
            attachableType: "unit",
            attachableId: "u1",
            materialId: "m1",
            role: "supporting",
          },
        ]),
      );
      // units query → courseId resolved
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // ownership check → empty = forbidden
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postDetachMaterial(makeRequest({ materialAttachmentId: "a1" }));

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    });

    it("returns 404 when unit is not found (unit attachable)", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // materialAttachments query → found, attachableType "unit"
      mockDbSelect.mockReturnValueOnce(
        makeChain([
          {
            id: "a1",
            attachableType: "unit",
            attachableId: "u-deleted",
            materialId: "m1",
            role: "supporting",
          },
        ]),
      );
      // units query → not found
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postDetachMaterial(makeRequest({ materialAttachmentId: "a1" }));

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Unit not found");
    });

    it("returns 404 when the referenced lesson is not found (lesson attachable)", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // materialAttachments query → found, attachableType "lesson"
      mockDbSelect.mockReturnValueOnce(
        makeChain([
          {
            id: "a1",
            attachableType: "lesson",
            attachableId: "l-deleted",
            materialId: "m1",
            role: "supporting",
          },
        ]),
      );
      // lessons query → deleted between attachment lookup and now
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postDetachMaterial(makeRequest({ materialAttachmentId: "a1" }));

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Lesson not found");
    });

    it("returns 404 when unit is not found (lesson attachable, orphaned FK)", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // materialAttachments query → found, attachableType "lesson"
      mockDbSelect.mockReturnValueOnce(
        makeChain([
          {
            id: "a1",
            attachableType: "lesson",
            attachableId: "l1",
            materialId: "m1",
            role: "supporting",
          },
        ]),
      );
      // lessons query → found
      mockDbSelect.mockReturnValueOnce(makeChain([{ unitId: "u-deleted" }]));
      // units query → orphaned FK, unit deleted
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postDetachMaterial(makeRequest({ materialAttachmentId: "a1" }));

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Unit not found");
    });

    it("returns 404 when the referenced assessment is not found (assessment attachable)", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // materialAttachments query → found, attachableType "assessment"
      mockDbSelect.mockReturnValueOnce(
        makeChain([
          {
            id: "a1",
            attachableType: "assessment",
            attachableId: "as-deleted",
            materialId: "m1",
            role: "supporting",
          },
        ]),
      );
      // assessments query → deleted
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postDetachMaterial(makeRequest({ materialAttachmentId: "a1" }));

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Assessment not found");
    });
  });

  describe("POST /api/curriculum/editor/retype-content", () => {
    function makeRequest(body: unknown) {
      return new Request("http://localhost/api/curriculum/editor/retype-content", {
        method: "POST",
        body: JSON.stringify(body),
      });
    }

    it("returns 401 when unauthenticated", async () => {
      mockGetServerSession.mockResolvedValueOnce(null);

      const res = await postRetypeContent(
        makeRequest({ entityType: "lesson", entityId: "l1", newType: "assessment" }),
      );

      expect(res.status).toBe(401);
    });

    it("returns 403 when session user does not own the course (lesson → assessment)", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // lessons query → found
      mockDbSelect.mockReturnValueOnce(
        makeChain([{ id: "l1", unitId: "u1", title: "Lesson 1", sortOrder: 1, source: null }]),
      );
      // units query → courseId resolved
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // ownership check → empty = forbidden
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postRetypeContent(
        makeRequest({ entityType: "lesson", entityId: "l1", newType: "assessment" }),
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    });

    it("returns 404 when unit is not found (lesson → assessment)", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // lessons query → found
      mockDbSelect.mockReturnValueOnce(
        makeChain([
          { id: "l1", unitId: "u-deleted", title: "Lesson 1", sortOrder: 1, source: null },
        ]),
      );
      // units query → unit was deleted
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postRetypeContent(
        makeRequest({ entityType: "lesson", entityId: "l1", newType: "assessment" }),
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Unit not found");
    });

    it("returns 404 when unit is not found (assessment → lesson)", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // assessments query → found
      mockDbSelect.mockReturnValueOnce(
        makeChain([
          {
            id: "as1",
            unitId: "u-deleted",
            title: "Assessment 1",
            sortOrder: 1,
            source: null,
            assessmentType: "formative",
          },
        ]),
      );
      // units query → unit was deleted
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postRetypeContent(
        makeRequest({ entityType: "assessment", entityId: "as1", newType: "lesson" }),
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Unit not found");
    });
  });

  describe("POST /api/curriculum/editor/update-item", () => {
    function makeRequest(body: unknown) {
      return new Request("http://localhost/api/curriculum/editor/update-item", {
        method: "POST",
        body: JSON.stringify(body),
      });
    }

    it("returns 401 when unauthenticated", async () => {
      mockGetServerSession.mockResolvedValueOnce(null);

      const res = await postUpdateItem(
        makeRequest({ entityType: "lesson", entityId: "l1", fields: { title: "New" } }),
      );

      expect(res.status).toBe(401);
    });

    it("returns 403 when session user does not own the course (lesson entity)", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // lessons query → found
      mockDbSelect.mockReturnValueOnce(
        makeChain([
          { id: "l1", unitId: "u1", title: "Old Title", sortOrder: 1, durationMinutes: null },
        ]),
      );
      // units query → courseId resolved
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // ownership check → empty = forbidden
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postUpdateItem(
        makeRequest({ entityType: "lesson", entityId: "l1", fields: { title: "New Title" } }),
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    });
  });

  describe("POST /api/curriculum/editor/update-material", () => {
    function makeRequest(body: unknown) {
      return new Request("http://localhost/api/curriculum/editor/update-material", {
        method: "POST",
        body: JSON.stringify(body),
      });
    }

    it("returns 401 when unauthenticated", async () => {
      mockGetServerSession.mockResolvedValueOnce(null);

      const res = await postUpdateMaterial(makeRequest({ attachmentId: "a1", role: "primary" }));

      expect(res.status).toBe(401);
    });

    it("returns 403 when session user does not own the course (unit attachable)", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // materialAttachments query → found, attachableType "unit"
      mockDbSelect.mockReturnValueOnce(
        makeChain([
          {
            id: "a1",
            attachableType: "unit",
            attachableId: "u1",
            materialId: "m1",
            role: "supporting",
          },
        ]),
      );
      // units query (topUnit) → courseId resolved directly
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // ownership check → empty = forbidden
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postUpdateMaterial(makeRequest({ attachmentId: "a1", role: "primary" }));

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    });
  });

  describe("POST /api/curriculum/editor/move-lesson", () => {
    function makeRequest(body: unknown) {
      return new Request("http://localhost/api/curriculum/editor/move-lesson", {
        method: "POST",
        body: JSON.stringify(body),
      });
    }

    const PAYLOAD = { lessonId: "l1", fromUnitId: "u1", toUnitId: "u2", newSortOrder: 1 };

    it("returns 401 when unauthenticated", async () => {
      mockGetServerSession.mockResolvedValueOnce(null);

      const res = await postMoveLesson(makeRequest(PAYLOAD));

      expect(res.status).toBe(401);
    });

    it("returns 403 when lessonId belongs to a different unit than fromUnitId (cross-unit IDOR)", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // lesson found, but unitId is u99 (victim's unit) — not the attacker's u1
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "l1", unitId: "u99", sortOrder: 2 }]));

      const res = await postMoveLesson(makeRequest(PAYLOAD));

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    });

    it("returns 403 when session user does not own the source course", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // lesson query → found, unitId matches fromUnitId
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "l1", unitId: "u1", sortOrder: 2 }]));
      // fromUnit query → courseId
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // source ownership check → empty = not owned by B
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postMoveLesson(makeRequest(PAYLOAD));

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    });

    it("returns 403 when session user does not own the destination course", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // lesson query → found
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "l1", unitId: "u1", sortOrder: 2 }]));
      // fromUnit query → courseId owned by B
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-B" }]));
      // source ownership check → found (owned by B)
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "course-owned-by-B" }]));
      // toUnit query → courseId owned by A
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // destination ownership check → empty = not owned by B
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postMoveLesson(makeRequest(PAYLOAD));

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    });

    it("returns 404 when the lesson does not exist", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postMoveLesson(makeRequest(PAYLOAD));

      expect(res.status).toBe(404);
    });

    it("returns 404 when the source unit does not exist", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);
      // lesson found
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "l1", unitId: "u1", sortOrder: 2 }]));
      // fromUnit not found
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postMoveLesson(makeRequest(PAYLOAD));

      expect(res.status).toBe(404);
    });

    it("returns 404 when the destination unit does not exist", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);
      // lesson found
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "l1", unitId: "u1", sortOrder: 2 }]));
      // fromUnit found
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-B" }]));
      // source ownership → owned by B
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "course-owned-by-B" }]));
      // toUnit not found
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postMoveLesson(makeRequest(PAYLOAD));

      expect(res.status).toBe(404);
    });

    it("wraps all three sort-order writes in a single transaction", async () => {
      const SESSION_A = { user: { email: "userA@school.edu" }, expires: "" };
      mockGetServerSession.mockResolvedValueOnce(SESSION_A);
      // lesson found
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "l1", unitId: "u1", sortOrder: 2 }]));
      // fromUnit found
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // source ownership → owned by A
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "course-owned-by-A" }]));
      // toUnit found
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // dest ownership → owned by A
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "course-owned-by-A" }]));

      const txUpdate = vi.fn().mockReturnValue(makeChain(undefined));
      mockDbTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
        return await cb({ update: txUpdate });
      });

      // logEdit insert
      mockDbInsert.mockReturnValue(makeChain(undefined));

      const res = await postMoveLesson(makeRequest(PAYLOAD));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true });
      expect(mockDbTransaction).toHaveBeenCalledOnce();
      // All three writes go through tx, not db directly
      expect(txUpdate).toHaveBeenCalledTimes(3);
      expect(mockDbUpdate).not.toHaveBeenCalled();
    });

    it("returns 500 and does not leave partial writes when the transaction rejects", async () => {
      const SESSION_A = { user: { email: "userA@school.edu" }, expires: "" };
      mockGetServerSession.mockResolvedValueOnce(SESSION_A);
      // lesson found
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "l1", unitId: "u1", sortOrder: 2 }]));
      // fromUnit found
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // source ownership → owned by A
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "course-owned-by-A" }]));
      // toUnit found
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // dest ownership → owned by A
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "course-owned-by-A" }]));

      const dbError = new Error("DB write failed");
      // Transaction rejects (simulates a write failure triggering rollback)
      mockDbTransaction.mockRejectedValueOnce(dbError);

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await postMoveLesson(makeRequest(PAYLOAD));

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("Failed to move lesson");
      // logEdit is not reached — no insert after a failed transaction
      expect(mockDbInsert).not.toHaveBeenCalled();
      // error is logged so it appears in Sentry / server logs
      expect(consoleErrorSpy).toHaveBeenCalledWith("[move-lesson] transaction failed", dbError);

      consoleErrorSpy.mockRestore();
    });

    it("returns 200 even when logEdit throws after the transaction commits", async () => {
      const SESSION_A = { user: { email: "userA@school.edu" }, expires: "" };
      mockGetServerSession.mockResolvedValueOnce(SESSION_A);
      // lesson found
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "l1", unitId: "u1", sortOrder: 2 }]));
      // fromUnit found
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // source ownership → owned by A
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "course-owned-by-A" }]));
      // toUnit found
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // dest ownership → owned by A
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "course-owned-by-A" }]));

      const txUpdate = vi.fn().mockReturnValue(makeChain(undefined));
      mockDbTransaction.mockImplementationOnce(async (cb: (tx: unknown) => Promise<void>) => {
        return await cb({ update: txUpdate });
      });

      // logEdit insert rejects after the transaction commits (simulates audit DB outage)
      const logEditError = new Error("audit DB outage");
      mockDbInsert.mockImplementationOnce(() => ({ values: () => Promise.reject(logEditError) }));

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await postMoveLesson(makeRequest(PAYLOAD));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true });
      // logEdit failure is logged but does not fail the request
      expect(consoleErrorSpy).toHaveBeenCalledWith("[move-lesson] logEdit failed:", logEditError);
      consoleErrorSpy.mockRestore();
    });
  });

  describe("POST /api/curriculum/editor/move-assessment", () => {
    function makeRequest(body: unknown) {
      return new Request("http://localhost/api/curriculum/editor/move-assessment", {
        method: "POST",
        body: JSON.stringify(body),
      });
    }

    const PAYLOAD = { assessmentId: "a1", fromUnitId: "u1", toUnitId: "u2", newSortOrder: 1 };

    it("returns 401 when unauthenticated", async () => {
      mockGetServerSession.mockResolvedValueOnce(null);

      const res = await postMoveAssessment(makeRequest(PAYLOAD));

      expect(res.status).toBe(401);
    });

    it("returns 403 when assessmentId belongs to a different unit than fromUnitId (cross-unit IDOR)", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);
      // assessment found, but unitId is u99 (victim's unit) — not the attacker's u1
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "a1", unitId: "u99", sortOrder: 2 }]));

      const res = await postMoveAssessment(makeRequest(PAYLOAD));

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    });

    it("returns 403 when session user does not own the source course", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // assessment query → found, unitId matches fromUnitId
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "a1", unitId: "u1", sortOrder: 2 }]));
      // fromUnit query → courseId
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // source ownership check → empty = not owned by B
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postMoveAssessment(makeRequest(PAYLOAD));

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    });

    it("returns 403 when session user does not own the destination course", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // assessment query → found
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "a1", unitId: "u1", sortOrder: 2 }]));
      // fromUnit query → courseId owned by B
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-B" }]));
      // source ownership check → found (owned by B)
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "course-owned-by-B" }]));
      // toUnit query → courseId owned by A
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // destination ownership check → empty = not owned by B
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postMoveAssessment(makeRequest(PAYLOAD));

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    });

    it("returns 404 when assessment does not exist", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // assessment query → not found
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postMoveAssessment(makeRequest(PAYLOAD));

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Assessment not found");
    });

    it("wraps all three sort-order writes in a single transaction", async () => {
      const SESSION_A = { user: { email: "userA@school.edu" }, expires: "" };
      mockGetServerSession.mockResolvedValueOnce(SESSION_A);

      // assessment found, unitId matches fromUnitId
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "a1", unitId: "u1", sortOrder: 2 }]));
      // fromUnit → courseId
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // source ownership → owned by A
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "course-owned-by-A" }]));
      // toUnit → courseId
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // dest ownership → owned by A
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "course-owned-by-A" }]));

      const txUpdate = vi.fn().mockReturnValue(makeChain(undefined));
      mockDbTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
        return await cb({ update: txUpdate });
      });

      // logEdit insert
      mockDbInsert.mockReturnValue(makeChain(undefined));

      const res = await postMoveAssessment(makeRequest(PAYLOAD));

      expect(res.status).toBe(200);
      expect(mockDbTransaction).toHaveBeenCalledOnce();
      // All three writes go through tx, not db directly
      expect(txUpdate).toHaveBeenCalledTimes(3);
      expect(mockDbUpdate).not.toHaveBeenCalled();
    });

    it("returns 500 and does not leave partial writes when the transaction rejects", async () => {
      const SESSION_A = { user: { email: "userA@school.edu" }, expires: "" };
      mockGetServerSession.mockResolvedValueOnce(SESSION_A);

      // assessment found
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "a1", unitId: "u1", sortOrder: 2 }]));
      // fromUnit → courseId
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // source ownership → owned by A
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "course-owned-by-A" }]));
      // toUnit → courseId
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // dest ownership → owned by A
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "course-owned-by-A" }]));

      const dbError = new Error("DB write failed");
      // Transaction rejects (simulates third write failure triggering a rollback)
      mockDbTransaction.mockRejectedValueOnce(dbError);

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await postMoveAssessment(makeRequest(PAYLOAD));

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("Failed to move assessment");
      // logEdit is not reached — no insert after a failed transaction
      expect(mockDbInsert).not.toHaveBeenCalled();
      // error is logged so it appears in Sentry / server logs
      expect(consoleErrorSpy).toHaveBeenCalledWith("[move-assessment] transaction failed", dbError);

      consoleErrorSpy.mockRestore();
    });
  });
});
