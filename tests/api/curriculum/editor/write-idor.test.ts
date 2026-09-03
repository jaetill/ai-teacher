import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────
const { mockDbSelect, mockDbInsert, mockDbUpdate, mockDbDelete, mockDbBatch } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbDelete: vi.fn(),
  mockDbBatch: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
// Route 5xx paths go through apiError() → error_events insert + Sentry. Stub it
// so the db.insert call counts below stay about the route's own writes.
const { mockApiError } = vi.hoisted(() => ({
  mockApiError: vi.fn(
    async (_route: string, status: number, _reason: string, message: string) =>
      Response.json({ error: message }, { status }),
  ),
}));
vi.mock("@/lib/error-log", () => ({ apiError: mockApiError }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/db", () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
    delete: mockDbDelete,
    batch: mockDbBatch,
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
  or: vi.fn(),
  isNull: vi.fn(),
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  const self = () => chain;
  for (const m of [
    "from",
    "where",
    "orderBy",
    "limit",
    "values",
    "onConflictDoNothing",
    "returning",
    "set",
  ]) {
    chain[m] = vi.fn(self);
  }
  chain.then = (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => p.then(r, j);
  chain.catch = (j: (e: unknown) => unknown) => p.catch(j);
  chain.finally = (fn: () => void) => p.finally(fn);
  return chain;
}

const SESSION_B = { user: { email: "userB@school.edu" }, expires: "" };

// Valid UUID fixtures — routes now 400 on non-UUID ids before touching the DB.
const UID = {
  u1: "550e8400-e29b-41d4-a716-446655440001",
  u2: "550e8400-e29b-41d4-a716-446655440002",
  u99: "550e8400-e29b-41d4-a716-446655440099",
  l1: "550e8400-e29b-41d4-a716-446655440011",
  a1: "550e8400-e29b-41d4-a716-446655440021",
  as1: "550e8400-e29b-41d4-a716-446655440022",
  m1: "550e8400-e29b-41d4-a716-446655440031",
  missing: "550e8400-e29b-41d4-a716-446655440041",
  lDeleted: "550e8400-e29b-41d4-a716-446655440043",
  uDeleted: "550e8400-e29b-41d4-a716-446655440044",
  asDeleted: "550e8400-e29b-41d4-a716-446655440045",
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    it("returns 400 on a malformed JSON body", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      const res = await postReorderLessons(
        new Request("http://localhost/api/curriculum/editor/reorder-lessons", {
          method: "POST",
          body: "{not json",
        }),
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Invalid JSON body");
      expect(mockDbSelect).not.toHaveBeenCalled();
    });

    it("returns 400 when unitId is not a UUID", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      const res = await postReorderLessons(makeRequest({ unitId: "unit-1", lessonIds: [UID.l1] }));

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Invalid unitId");
      expect(mockDbSelect).not.toHaveBeenCalled();
    });

    it("returns 400 when lessonIds is empty, oversized, or contains a non-UUID", async () => {
      mockGetServerSession.mockResolvedValue(SESSION_B);

      for (const lessonIds of [[], ["lesson-1"], Array.from({ length: 501 }, () => UID.l1)]) {
        const res = await postReorderLessons(makeRequest({ unitId: UID.u1, lessonIds }));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBe("Invalid lessonIds");
      }
      expect(mockDbSelect).not.toHaveBeenCalled();
    });

    it("returns 401 when unauthenticated", async () => {
      mockGetServerSession.mockResolvedValueOnce(null);

      const res = await postReorderLessons(makeRequest({ unitId: UID.u1, lessonIds: [] }));

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Not authenticated");
    });

    it("returns 403 when session user does not own the course", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // lessons query (current sort order for logging)
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: UID.l1, sortOrder: 1 }]));
      // units query → returns courseId
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // ownership check → empty = not owned by user B
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postReorderLessons(makeRequest({ unitId: UID.u1, lessonIds: [UID.l1] }));

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

      const res = await postReorderLessons(
        makeRequest({ unitId: UID.missing, lessonIds: [UID.l1] }),
      );

      expect(res.status).toBe(404);
    });

    it("scopes each update to unitId so foreign lesson IDs cannot be mutated", async () => {
      const SESSION_A = { user: { email: "userA@school.edu" }, expires: "" };
      mockGetServerSession.mockResolvedValueOnce(SESSION_A);

      // lessons query (current sort order)
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: UID.l1, sortOrder: 1 }]));
      // units query → courseId resolved
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // ownership check → owned by A
      mockDbSelect.mockReturnValueOnce(makeChain([{ ownerEmail: "userA@school.edu" }]));
      // log-edit select calls
      mockDbSelect.mockReturnValue(makeChain([]));
      mockDbUpdate.mockReturnValue(makeChain(undefined));
      mockDbInsert.mockReturnValue(makeChain(undefined));

      const { and: mockAnd } = await import("drizzle-orm");

      const res = await postReorderLessons(makeRequest({ unitId: UID.u1, lessonIds: [UID.l1] }));

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

    it("returns 400 when materialId or attachableId is not a UUID", async () => {
      mockGetServerSession.mockResolvedValue(SESSION_B);

      for (const body of [
        { materialId: "material-1", attachableType: "unit", attachableId: UID.u1 },
        { materialId: UID.m1, attachableType: "unit", attachableId: "unit-1" },
      ]) {
        const res = await postAttachMaterial(makeRequest(body));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe("Invalid id");
      }
      expect(mockDbSelect).not.toHaveBeenCalled();
    });

    it("returns 400 when attachableType is not unit|lesson|assessment", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      const res = await postAttachMaterial(
        makeRequest({ materialId: UID.m1, attachableType: "course", attachableId: UID.u1 }),
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Invalid attachableType");
      expect(mockDbSelect).not.toHaveBeenCalled();
    });

    it("returns 404 when the material does not exist", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // materials query → not found
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postAttachMaterial(
        makeRequest({ materialId: UID.m1, attachableType: "unit", attachableId: UID.u1 }),
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Material not found");
      // no insert happens for a dangling materialId
      expect(mockDbInsert).not.toHaveBeenCalled();
    });

    it("normalizes an unknown role to 'supporting' and returns the attachment id", async () => {
      const SESSION_A = { user: { email: "userA@school.edu" }, expires: "" };
      mockGetServerSession.mockResolvedValueOnce(SESSION_A);

      // materials query → material exists
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: UID.m1 }]));
      // units query → courseId resolved
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // ownership check → owned by A
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "course-owned-by-A" }]));

      const insertChain = makeChain([{ id: "att-1" }]);
      mockDbInsert.mockReturnValueOnce(insertChain); // attachment insert
      mockDbInsert.mockReturnValue(makeChain(undefined)); // logEdit

      const res = await postAttachMaterial(
        makeRequest({
          materialId: UID.m1,
          attachableType: "unit",
          attachableId: UID.u1,
          role: "banana",
        }),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true, attachmentId: "att-1" });
      // garbage roles are not stored verbatim
      expect(insertChain.values.mock.calls[0][0].role).toBe("supporting");
    });

    it("returns 401 when unauthenticated", async () => {
      mockGetServerSession.mockResolvedValueOnce(null);

      const res = await postAttachMaterial(
        makeRequest({ materialId: UID.m1, attachableType: "unit", attachableId: UID.u1 }),
      );

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Not authenticated");
    });

    it("returns 403 when session user does not own the course (unit attachable)", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);
      // materials query → material exists
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: UID.m1 }]));

      // units query → courseId resolved
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // ownership check → empty = forbidden
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postAttachMaterial(
        makeRequest({ materialId: UID.m1, attachableType: "unit", attachableId: UID.u1 }),
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    });

    it("returns 404 when unit does not exist (unit attachable)", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);
      // materials query → material exists
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: UID.m1 }]));

      // units query → not found
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postAttachMaterial(
        makeRequest({ materialId: UID.m1, attachableType: "unit", attachableId: UID.missing }),
      );

      expect(res.status).toBe(404);
    });

    it("returns 404 when unit is not found (lesson attachable)", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);
      // materials query → material exists
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: UID.m1 }]));

      // lessons query → found
      mockDbSelect.mockReturnValueOnce(makeChain([{ unitId: UID.uDeleted }]));
      // units query → orphaned FK, unit deleted
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postAttachMaterial(
        makeRequest({ materialId: UID.m1, attachableType: "lesson", attachableId: UID.l1 }),
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Unit not found");
    });

    it("returns 404 when unit is not found (assessment attachable)", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);
      // materials query → material exists
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: UID.m1 }]));

      // assessments query → found
      mockDbSelect.mockReturnValueOnce(makeChain([{ unitId: UID.uDeleted }]));
      // units query → orphaned FK, unit deleted
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postAttachMaterial(
        makeRequest({ materialId: UID.m1, attachableType: "assessment", attachableId: UID.a1 }),
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Unit not found");
    });

    describe("lesson attachable", () => {
      it("returns 401 when unauthenticated", async () => {
        mockGetServerSession.mockResolvedValueOnce(null);

        const res = await postAttachMaterial(
          makeRequest({ materialId: UID.m1, attachableType: "lesson", attachableId: UID.l1 }),
        );

        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.error).toBe("Not authenticated");
      });

      it("returns 403 when session user does not own the course", async () => {
        mockGetServerSession.mockResolvedValueOnce(SESSION_B);
        // materials query → material exists
        mockDbSelect.mockReturnValueOnce(makeChain([{ id: UID.m1 }]));

        // lessons query → lesson found
        mockDbSelect.mockReturnValueOnce(makeChain([{ unitId: "unit-of-A" }]));
        // units query → courseId resolved
        mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
        // ownership check → not owned by B
        mockDbSelect.mockReturnValueOnce(makeChain([]));

        const res = await postAttachMaterial(
          makeRequest({ materialId: UID.m1, attachableType: "lesson", attachableId: UID.l1 }),
        );

        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.error).toBe("Forbidden");
      });

      it("returns 404 when lesson does not exist", async () => {
        mockGetServerSession.mockResolvedValueOnce(SESSION_B);
        // materials query → material exists
        mockDbSelect.mockReturnValueOnce(makeChain([{ id: UID.m1 }]));

        // lessons query → not found
        mockDbSelect.mockReturnValueOnce(makeChain([]));

        const res = await postAttachMaterial(
          makeRequest({ materialId: UID.m1, attachableType: "lesson", attachableId: UID.missing }),
        );

        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error).toBe("Lesson not found");
      });
    });

    describe("assessment attachable", () => {
      it("returns 401 when unauthenticated", async () => {
        mockGetServerSession.mockResolvedValueOnce(null);

        const res = await postAttachMaterial(
          makeRequest({ materialId: UID.m1, attachableType: "assessment", attachableId: UID.a1 }),
        );

        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.error).toBe("Not authenticated");
      });

      it("returns 403 when session user does not own the course", async () => {
        mockGetServerSession.mockResolvedValueOnce(SESSION_B);
        // materials query → material exists
        mockDbSelect.mockReturnValueOnce(makeChain([{ id: UID.m1 }]));

        // assessments query → assessment found
        mockDbSelect.mockReturnValueOnce(makeChain([{ unitId: "unit-of-A" }]));
        // units query → courseId resolved
        mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
        // ownership check → not owned by B
        mockDbSelect.mockReturnValueOnce(makeChain([]));

        const res = await postAttachMaterial(
          makeRequest({ materialId: UID.m1, attachableType: "assessment", attachableId: UID.a1 }),
        );

        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.error).toBe("Forbidden");
      });

      it("returns 404 when assessment does not exist", async () => {
        mockGetServerSession.mockResolvedValueOnce(SESSION_B);
        // materials query → material exists
        mockDbSelect.mockReturnValueOnce(makeChain([{ id: UID.m1 }]));

        // assessments query → not found
        mockDbSelect.mockReturnValueOnce(makeChain([]));

        const res = await postAttachMaterial(
          makeRequest({
            materialId: UID.m1,
            attachableType: "assessment",
            attachableId: UID.missing,
          }),
        );

        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error).toBe("Assessment not found");
      });
    });
  });

  describe("POST /api/curriculum/editor/detach-material", () => {
    function makeRequest(body: unknown) {
      return new Request("http://localhost/api/curriculum/editor/detach-material", {
        method: "POST",
        body: JSON.stringify(body),
      });
    }

    it("returns 400 when materialAttachmentId is not a UUID", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      const res = await postDetachMaterial(makeRequest({ materialAttachmentId: "attach-1" }));

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Invalid id");
      expect(mockDbSelect).not.toHaveBeenCalled();
    });

    it("returns 401 when unauthenticated", async () => {
      mockGetServerSession.mockResolvedValueOnce(null);

      const res = await postDetachMaterial(makeRequest({ materialAttachmentId: UID.a1 }));

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Not authenticated");
    });

    it("returns 404 when materialAttachmentId is not found", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // materialAttachments query → not found
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postDetachMaterial(makeRequest({ materialAttachmentId: UID.missing }));

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Attachment not found");
    });

    it("returns 403 when session user does not own the course", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // materialAttachments query → found, attachableType "unit"
      mockDbSelect.mockReturnValueOnce(
        makeChain([
          {
            id: UID.a1,
            attachableType: "unit",
            attachableId: UID.u1,
            materialId: UID.m1,
            role: "supporting",
          },
        ]),
      );
      // units query → courseId resolved
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // ownership check → empty = forbidden
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postDetachMaterial(makeRequest({ materialAttachmentId: UID.a1 }));

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    });

    it("returns 403 when session user does not own the course (lesson attachable)", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // materialAttachments query → found, attachableType "lesson"
      mockDbSelect.mockReturnValueOnce(
        makeChain([
          {
            id: UID.a1,
            attachableType: "lesson",
            attachableId: UID.l1,
            materialId: UID.m1,
            role: "supporting",
          },
        ]),
      );
      // lessons query → found, returns unitId
      mockDbSelect.mockReturnValueOnce(makeChain([{ unitId: UID.u1 }]));
      // units query → courseId resolved
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // ownership check → empty = forbidden
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postDetachMaterial(makeRequest({ materialAttachmentId: UID.a1 }));

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    });

    it("returns 403 when session user does not own the course (assessment attachable)", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // materialAttachments query → found, attachableType "assessment"
      mockDbSelect.mockReturnValueOnce(
        makeChain([
          {
            id: UID.a1,
            attachableType: "assessment",
            attachableId: UID.as1,
            materialId: UID.m1,
            role: "supporting",
          },
        ]),
      );
      // assessments query → found, returns unitId
      mockDbSelect.mockReturnValueOnce(makeChain([{ unitId: UID.u1 }]));
      // units query → courseId resolved
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // ownership check → empty = forbidden
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postDetachMaterial(makeRequest({ materialAttachmentId: UID.a1 }));

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
            id: UID.a1,
            attachableType: "unit",
            attachableId: UID.uDeleted,
            materialId: UID.m1,
            role: "supporting",
          },
        ]),
      );
      // units query → not found
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postDetachMaterial(makeRequest({ materialAttachmentId: UID.a1 }));

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
            id: UID.a1,
            attachableType: "lesson",
            attachableId: UID.lDeleted,
            materialId: UID.m1,
            role: "supporting",
          },
        ]),
      );
      // lessons query → deleted between attachment lookup and now
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postDetachMaterial(makeRequest({ materialAttachmentId: UID.a1 }));

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
            id: UID.a1,
            attachableType: "lesson",
            attachableId: UID.l1,
            materialId: UID.m1,
            role: "supporting",
          },
        ]),
      );
      // lessons query → found
      mockDbSelect.mockReturnValueOnce(makeChain([{ unitId: UID.uDeleted }]));
      // units query → orphaned FK, unit deleted
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postDetachMaterial(makeRequest({ materialAttachmentId: UID.a1 }));

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
            id: UID.a1,
            attachableType: "assessment",
            attachableId: UID.asDeleted,
            materialId: UID.m1,
            role: "supporting",
          },
        ]),
      );
      // assessments query → deleted
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postDetachMaterial(makeRequest({ materialAttachmentId: UID.a1 }));

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

    it("returns 400 when entityId is not a UUID or a type is invalid", async () => {
      mockGetServerSession.mockResolvedValue(SESSION_B);

      for (const body of [
        { entityType: "lesson", entityId: "lesson-1", newType: "assessment" },
        { entityType: "unit", entityId: UID.l1, newType: "assessment" },
        { entityType: "lesson", entityId: UID.l1, newType: "bogus" },
      ]) {
        const res = await postRetypeContent(makeRequest(body));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe("Invalid payload");
      }
      expect(mockDbSelect).not.toHaveBeenCalled();
    });

    it("returns 400 when entityType equals newType", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      const res = await postRetypeContent(
        makeRequest({ entityType: "lesson", entityId: UID.l1, newType: "lesson" }),
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Already that type");
      expect(mockDbSelect).not.toHaveBeenCalled();
    });

    it("returns 401 when unauthenticated", async () => {
      mockGetServerSession.mockResolvedValueOnce(null);

      const res = await postRetypeContent(
        makeRequest({ entityType: "lesson", entityId: UID.l1, newType: "assessment" }),
      );

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Not authenticated");
    });

    it("returns 403 when session user does not own the course (lesson → assessment)", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // lessons query → found
      mockDbSelect.mockReturnValueOnce(
        makeChain([{ id: UID.l1, unitId: UID.u1, title: "Lesson 1", sortOrder: 1, source: null }]),
      );
      // units query → courseId resolved
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // ownership check → empty = forbidden
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postRetypeContent(
        makeRequest({ entityType: "lesson", entityId: UID.l1, newType: "assessment" }),
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    });

    it("returns 403 when session user does not own the course (assessment → lesson)", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // assessments query → found
      mockDbSelect.mockReturnValueOnce(
        makeChain([
          {
            id: UID.a1,
            unitId: UID.u1,
            title: "A1",
            sortOrder: 1,
            assessmentType: "formative",
            source: null,
          },
        ]),
      );
      // units query → courseId resolved
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // ownership check → empty = forbidden
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postRetypeContent(
        makeRequest({ entityType: "assessment", entityId: UID.a1, newType: "lesson" }),
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
          { id: UID.l1, unitId: UID.uDeleted, title: "Lesson 1", sortOrder: 1, source: null },
        ]),
      );
      // units query → unit was deleted
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postRetypeContent(
        makeRequest({ entityType: "lesson", entityId: UID.l1, newType: "assessment" }),
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
            id: UID.as1,
            unitId: UID.uDeleted,
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
        makeRequest({ entityType: "assessment", entityId: UID.as1, newType: "lesson" }),
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Unit not found");
    });

    it("returns 401 when unauthenticated (assessment → lesson)", async () => {
      mockGetServerSession.mockResolvedValueOnce(null);

      const res = await postRetypeContent(
        makeRequest({ entityType: "assessment", entityId: UID.as1, newType: "lesson" }),
      );

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Not authenticated");
    });

    it("returns 403 when session user does not own the course (assessment → lesson)", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // assessments query → found
      mockDbSelect.mockReturnValueOnce(
        makeChain([
          {
            id: UID.as1,
            unitId: UID.u1,
            title: "Assessment 1",
            sortOrder: 1,
            source: null,
            assessmentType: "formative",
          },
        ]),
      );
      // units query → courseId resolved
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // ownership check → empty = forbidden
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postRetypeContent(
        makeRequest({ entityType: "assessment", entityId: UID.as1, newType: "lesson" }),
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    });

    it("sends INSERT, UPDATE, DELETE as one atomic db.batch (lesson → assessment)", async () => {
      const SESSION_A = { user: { email: "userA@school.edu" }, expires: "" };
      mockGetServerSession.mockResolvedValueOnce(SESSION_A);

      // lesson found
      mockDbSelect.mockReturnValueOnce(
        makeChain([{ id: UID.l1, unitId: UID.u1, title: "Lesson 1", sortOrder: 1, source: null }]),
      );
      // unit found
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // ownership → owned by A
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "course-owned-by-A" }]));

      // db.insert builds the batched INSERT and, later, the logEdit row
      const insertChain = makeChain(undefined);
      mockDbInsert.mockReturnValue(insertChain);
      mockDbUpdate.mockReturnValue(makeChain(undefined));
      mockDbDelete.mockReturnValue(makeChain(undefined));
      mockDbBatch.mockResolvedValue([]);

      const res = await postRetypeContent(
        makeRequest({ entityType: "lesson", entityId: UID.l1, newType: "assessment" }),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      // the new id is pre-generated server-side (crypto.randomUUID) and returned
      expect(body.newId).toMatch(UUID_RE);
      // all three conversion writes execute inside a single atomic db.batch
      expect(mockDbBatch).toHaveBeenCalledOnce();
      expect(mockDbBatch.mock.calls[0][0]).toHaveLength(3);
      expect(mockDbUpdate).toHaveBeenCalledOnce();
      expect(mockDbDelete).toHaveBeenCalledOnce();
      // the inserted row carries the same pre-generated id the response returns
      expect(insertChain.values.mock.calls[0][0].id).toBe(body.newId);
      // db.insert is called only for the batched INSERT builder and for logEdit
      expect(mockDbInsert).toHaveBeenCalledTimes(2);
    });

    it("returns 500 and does not run logEdit when the batch rejects (lesson → assessment)", async () => {
      const SESSION_A = { user: { email: "userA@school.edu" }, expires: "" };
      mockGetServerSession.mockResolvedValueOnce(SESSION_A);

      // lesson found
      mockDbSelect.mockReturnValueOnce(
        makeChain([{ id: UID.l1, unitId: UID.u1, title: "Lesson 1", sortOrder: 1, source: null }]),
      );
      // unit found
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // ownership → owned by A
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "course-owned-by-A" }]));

      mockDbInsert.mockReturnValue(makeChain(undefined));
      mockDbUpdate.mockReturnValue(makeChain(undefined));
      mockDbDelete.mockReturnValue(makeChain(undefined));

      const dbError = new Error("DB write failed");
      mockDbBatch.mockRejectedValueOnce(dbError);

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await postRetypeContent(
        makeRequest({ entityType: "lesson", entityId: UID.l1, newType: "assessment" }),
      );

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("Failed to retype content");
      // logEdit is not reached — the only db.insert call built the batched statement
      expect(mockDbInsert).toHaveBeenCalledTimes(1);
      // The failure is recorded via apiError() (error_events + Sentry), mocked here.
      expect(mockApiError).toHaveBeenCalledWith(expect.any(String), 500, "write_failed", expect.any(String), expect.objectContaining({ cause: dbError }));

      consoleErrorSpy.mockRestore();
    });

    it("returns 200 even when logEdit throws after the batch commits (lesson → assessment)", async () => {
      const SESSION_A = { user: { email: "userA@school.edu" }, expires: "" };
      mockGetServerSession.mockResolvedValueOnce(SESSION_A);

      // lesson found
      mockDbSelect.mockReturnValueOnce(
        makeChain([{ id: UID.l1, unitId: UID.u1, title: "Lesson 1", sortOrder: 1, source: null }]),
      );
      // unit found
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // ownership → owned by A
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "course-owned-by-A" }]));

      mockDbUpdate.mockReturnValue(makeChain(undefined));
      mockDbDelete.mockReturnValue(makeChain(undefined));
      mockDbBatch.mockResolvedValueOnce([]);

      // first db.insert builds the batched INSERT; second is logEdit, which rejects
      mockDbInsert.mockReturnValueOnce(makeChain(undefined));
      const logEditError = new Error("audit DB outage");
      mockDbInsert.mockImplementationOnce(() => ({ values: () => Promise.reject(logEditError) }));

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await postRetypeContent(
        makeRequest({ entityType: "lesson", entityId: UID.l1, newType: "assessment" }),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.newId).toMatch(UUID_RE);
      // logEdit failure is logged but does not fail the request
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[retype-content] logEdit failed:",
        logEditError,
      );

      consoleErrorSpy.mockRestore();
    });

    it("sends INSERT, UPDATE, DELETE as one atomic db.batch (assessment → lesson)", async () => {
      const SESSION_A = { user: { email: "userA@school.edu" }, expires: "" };
      mockGetServerSession.mockResolvedValueOnce(SESSION_A);

      // assessment found
      mockDbSelect.mockReturnValueOnce(
        makeChain([
          {
            id: UID.as1,
            unitId: UID.u1,
            title: "Assessment 1",
            sortOrder: 1,
            source: null,
            assessmentType: "formative",
          },
        ]),
      );
      // unit found
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // ownership → owned by A
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "course-owned-by-A" }]));

      // db.insert builds the batched INSERT and, later, the logEdit row
      const insertChain = makeChain(undefined);
      mockDbInsert.mockReturnValue(insertChain);
      mockDbUpdate.mockReturnValue(makeChain(undefined));
      mockDbDelete.mockReturnValue(makeChain(undefined));
      mockDbBatch.mockResolvedValue([]);

      const res = await postRetypeContent(
        makeRequest({ entityType: "assessment", entityId: UID.as1, newType: "lesson" }),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      // the new id is pre-generated server-side (crypto.randomUUID) and returned
      expect(body.newId).toMatch(UUID_RE);
      // all three conversion writes execute inside a single atomic db.batch
      expect(mockDbBatch).toHaveBeenCalledOnce();
      expect(mockDbBatch.mock.calls[0][0]).toHaveLength(3);
      expect(mockDbUpdate).toHaveBeenCalledOnce();
      expect(mockDbDelete).toHaveBeenCalledOnce();
      // the inserted row carries the same pre-generated id the response returns
      expect(insertChain.values.mock.calls[0][0].id).toBe(body.newId);
      // db.insert is called only for the batched INSERT builder and for logEdit
      expect(mockDbInsert).toHaveBeenCalledTimes(2);
    });

    it("returns 500 and does not run logEdit when the batch rejects (assessment → lesson)", async () => {
      const SESSION_A = { user: { email: "userA@school.edu" }, expires: "" };
      mockGetServerSession.mockResolvedValueOnce(SESSION_A);

      // assessment found
      mockDbSelect.mockReturnValueOnce(
        makeChain([
          {
            id: UID.as1,
            unitId: UID.u1,
            title: "Assessment 1",
            sortOrder: 1,
            source: null,
            assessmentType: "formative",
          },
        ]),
      );
      // unit found
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // ownership → owned by A
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "course-owned-by-A" }]));

      mockDbInsert.mockReturnValue(makeChain(undefined));
      mockDbUpdate.mockReturnValue(makeChain(undefined));
      mockDbDelete.mockReturnValue(makeChain(undefined));

      const dbError = new Error("DB write failed");
      mockDbBatch.mockRejectedValueOnce(dbError);

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await postRetypeContent(
        makeRequest({ entityType: "assessment", entityId: UID.as1, newType: "lesson" }),
      );

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("Failed to retype content");
      // logEdit is not reached — the only db.insert call built the batched statement
      expect(mockDbInsert).toHaveBeenCalledTimes(1);
      // The failure is recorded via apiError() (error_events + Sentry), mocked here.
      expect(mockApiError).toHaveBeenCalledWith(expect.any(String), 500, "write_failed", expect.any(String), expect.objectContaining({ cause: dbError }));

      consoleErrorSpy.mockRestore();
    });

    it("returns 200 even when logEdit throws after the batch commits (assessment → lesson)", async () => {
      const SESSION_A = { user: { email: "userA@school.edu" }, expires: "" };
      mockGetServerSession.mockResolvedValueOnce(SESSION_A);

      // assessment found
      mockDbSelect.mockReturnValueOnce(
        makeChain([
          {
            id: UID.as1,
            unitId: UID.u1,
            title: "Assessment 1",
            sortOrder: 1,
            source: null,
            assessmentType: "formative",
          },
        ]),
      );
      // unit found
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // ownership → owned by A
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "course-owned-by-A" }]));

      mockDbUpdate.mockReturnValue(makeChain(undefined));
      mockDbDelete.mockReturnValue(makeChain(undefined));
      mockDbBatch.mockResolvedValueOnce([]);

      // first db.insert builds the batched INSERT; second is logEdit, which rejects
      mockDbInsert.mockReturnValueOnce(makeChain(undefined));
      const logEditError = new Error("audit DB outage");
      mockDbInsert.mockImplementationOnce(() => ({ values: () => Promise.reject(logEditError) }));

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await postRetypeContent(
        makeRequest({ entityType: "assessment", entityId: UID.as1, newType: "lesson" }),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.newId).toMatch(UUID_RE);
      // logEdit failure is logged but does not fail the request
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[retype-content] logEdit failed:",
        logEditError,
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe("POST /api/curriculum/editor/update-item", () => {
    function makeRequest(body: unknown) {
      return new Request("http://localhost/api/curriculum/editor/update-item", {
        method: "POST",
        body: JSON.stringify(body),
      });
    }

    it("returns 400 when entityId is not a UUID", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      const res = await postUpdateItem(
        makeRequest({ entityType: "lesson", entityId: "lesson-1", fields: { title: "New" } }),
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Invalid entityId");
      expect(mockDbSelect).not.toHaveBeenCalled();
    });

    it("returns 400 when a field value fails validation", async () => {
      mockGetServerSession.mockResolvedValue(SESSION_B);

      for (const [fields, key] of [
        [{ sortOrder: "abc" }, "sortOrder"],
        [{ title: "" }, "title"],
        [{ durationMinutes: 100000 }, "durationMinutes"],
      ] as const) {
        const res = await postUpdateItem(
          makeRequest({ entityType: "lesson", entityId: UID.l1, fields }),
        );
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe(`Invalid value for ${key}`);
      }
      // rejected before any DB read or write
      expect(mockDbSelect).not.toHaveBeenCalled();
      expect(mockDbUpdate).not.toHaveBeenCalled();
    });

    it("returns 401 when unauthenticated", async () => {
      mockGetServerSession.mockResolvedValueOnce(null);

      const res = await postUpdateItem(
        makeRequest({ entityType: "lesson", entityId: UID.l1, fields: { title: "New" } }),
      );

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Not authenticated");
    });

    it("returns 403 when session user does not own the course (lesson entity)", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // lessons query → found
      mockDbSelect.mockReturnValueOnce(
        makeChain([
          { id: UID.l1, unitId: UID.u1, title: "Old Title", sortOrder: 1, durationMinutes: null },
        ]),
      );
      // units query → courseId resolved
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // ownership check → empty = forbidden
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postUpdateItem(
        makeRequest({ entityType: "lesson", entityId: UID.l1, fields: { title: "New Title" } }),
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    });

    it("returns 403 when session user does not own the course (assessment entity)", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // assessments query → found
      mockDbSelect.mockReturnValueOnce(
        makeChain([
          {
            id: UID.as1,
            unitId: UID.u1,
            title: "Old Title",
            sortOrder: 1,
            assessmentType: "formative",
          },
        ]),
      );
      // units query → courseId resolved
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // ownership check → empty = forbidden
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postUpdateItem(
        makeRequest({
          entityType: "assessment",
          entityId: UID.as1,
          fields: { title: "New Title" },
        }),
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    });

    it("returns 403 when session user does not own the course (unit entity)", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // units query → found with courseId directly
      mockDbSelect.mockReturnValueOnce(
        makeChain([
          {
            id: UID.u1,
            courseId: "course-owned-by-A",
            title: "Old Title",
            sortOrder: 1,
            durationWeeks: null,
            quarter: null,
          },
        ]),
      );
      // ownership check → empty = forbidden
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postUpdateItem(
        makeRequest({ entityType: "unit", entityId: UID.u1, fields: { title: "New Title" } }),
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

    it("returns 400 when attachmentId is not a UUID", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      const res = await postUpdateMaterial(
        makeRequest({ attachmentId: "attach-1", role: "primary" }),
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("attachmentId required");
      expect(mockDbSelect).not.toHaveBeenCalled();
    });

    it("returns 401 when unauthenticated", async () => {
      mockGetServerSession.mockResolvedValueOnce(null);

      const res = await postUpdateMaterial(makeRequest({ attachmentId: UID.a1, role: "primary" }));

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Not authenticated");
    });

    it("returns 403 when session user does not own the course (unit attachable)", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // materialAttachments query → found, attachableType "unit"
      mockDbSelect.mockReturnValueOnce(
        makeChain([
          {
            id: UID.a1,
            attachableType: "unit",
            attachableId: UID.u1,
            materialId: UID.m1,
            role: "supporting",
          },
        ]),
      );
      // units query (topUnit) → courseId resolved directly
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // ownership check → empty = forbidden
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postUpdateMaterial(makeRequest({ attachmentId: UID.a1, role: "primary" }));

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    });

    it("returns 403 when session user does not own the course (lesson attachable, topUnit absent)", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // materialAttachments query → found, attachableType "lesson"
      mockDbSelect.mockReturnValueOnce(
        makeChain([
          {
            id: UID.a1,
            attachableType: "lesson",
            attachableId: UID.l1,
            materialId: UID.m1,
            role: "supporting",
          },
        ]),
      );
      // topUnit query → empty (not a unit-direct attachable)
      mockDbSelect.mockReturnValueOnce(makeChain([]));
      // lessons query → found, resolves unitId
      mockDbSelect.mockReturnValueOnce(makeChain([{ unitId: UID.u1 }]));
      // units query → courseId resolved via lesson's unit
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // ownership check → empty = forbidden
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postUpdateMaterial(makeRequest({ attachmentId: UID.a1, role: "primary" }));

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    });

    it("returns 403 when session user does not own the course (assessment attachable, topUnit absent)", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // materialAttachments query → found, attachableType "assessment"
      mockDbSelect.mockReturnValueOnce(
        makeChain([
          {
            id: UID.a1,
            attachableType: "assessment",
            attachableId: UID.as1,
            materialId: UID.m1,
            role: "supporting",
          },
        ]),
      );
      // topUnit query → empty (not a unit-direct attachable)
      mockDbSelect.mockReturnValueOnce(makeChain([]));
      // assessments query → found, resolves unitId
      mockDbSelect.mockReturnValueOnce(makeChain([{ unitId: UID.u1 }]));
      // units query → courseId resolved via assessment's unit
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // ownership check → empty = forbidden
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postUpdateMaterial(makeRequest({ attachmentId: UID.a1, role: "primary" }));

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    });

    it("returns 200 when unit attachable and ownership passes", async () => {
      const SESSION_A = { user: { email: "userA@school.edu" }, expires: "" };
      mockGetServerSession.mockResolvedValueOnce(SESSION_A);

      // materialAttachments query → found, attachableType "unit"
      mockDbSelect.mockReturnValueOnce(
        makeChain([
          {
            id: UID.a1,
            attachableType: "unit",
            attachableId: UID.u1,
            materialId: UID.m1,
            role: "supporting",
          },
        ]),
      );
      // topUnit query → courseId resolved directly
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // ownership check → owned by A
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "course-owned-by-A" }]));
      mockDbUpdate.mockReturnValue(makeChain(undefined));
      mockDbInsert.mockReturnValue(makeChain(undefined));

      const res = await postUpdateMaterial(makeRequest({ attachmentId: UID.a1, role: "primary" }));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true });
    });

    it("returns 200 when lesson attachable, two-hop resolves courseId, ownership passes", async () => {
      const SESSION_A = { user: { email: "userA@school.edu" }, expires: "" };
      mockGetServerSession.mockResolvedValueOnce(SESSION_A);

      // materialAttachments query → found, attachableType "lesson"
      mockDbSelect.mockReturnValueOnce(
        makeChain([
          {
            id: UID.a1,
            attachableType: "lesson",
            attachableId: UID.l1,
            materialId: UID.m1,
            role: "supporting",
          },
        ]),
      );
      // topUnit query → empty (attachable is a lesson, not a unit)
      mockDbSelect.mockReturnValueOnce(makeChain([]));
      // lessons query → found, resolves unitId
      mockDbSelect.mockReturnValueOnce(makeChain([{ unitId: UID.u1 }]));
      // units query → courseId resolved via lesson's unit
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // ownership check → owned by A
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "course-owned-by-A" }]));
      mockDbUpdate.mockReturnValue(makeChain(undefined));
      mockDbInsert.mockReturnValue(makeChain(undefined));

      const res = await postUpdateMaterial(makeRequest({ attachmentId: UID.a1, role: "primary" }));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true });
    });

    it("returns 200 when assessment attachable, two-hop resolves courseId, ownership passes", async () => {
      const SESSION_A = { user: { email: "userA@school.edu" }, expires: "" };
      mockGetServerSession.mockResolvedValueOnce(SESSION_A);

      // materialAttachments query → found, attachableType "assessment"
      mockDbSelect.mockReturnValueOnce(
        makeChain([
          {
            id: UID.a1,
            attachableType: "assessment",
            attachableId: UID.as1,
            materialId: UID.m1,
            role: "supporting",
          },
        ]),
      );
      // topUnit query → empty (attachable is an assessment, not a unit)
      mockDbSelect.mockReturnValueOnce(makeChain([]));
      // assessments query → found, resolves unitId
      mockDbSelect.mockReturnValueOnce(makeChain([{ unitId: UID.u1 }]));
      // units query → courseId resolved via assessment's unit
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // ownership check → owned by A
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "course-owned-by-A" }]));
      mockDbUpdate.mockReturnValue(makeChain(undefined));
      mockDbInsert.mockReturnValue(makeChain(undefined));

      const res = await postUpdateMaterial(makeRequest({ attachmentId: UID.a1, role: "primary" }));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true });
    });

    it("returns 403 when lesson not found (lesson attachable, courseId unresolvable)", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // materialAttachments query → found, attachableType "lesson"
      mockDbSelect.mockReturnValueOnce(
        makeChain([
          {
            id: UID.a1,
            attachableType: "lesson",
            attachableId: UID.lDeleted,
            materialId: UID.m1,
            role: "supporting",
          },
        ]),
      );
      // topUnit query → empty (not a unit-direct attachable)
      mockDbSelect.mockReturnValueOnce(makeChain([]));
      // lessons query → lesson not found, courseId stays undefined
      mockDbSelect.mockReturnValueOnce(makeChain([]));
      // assertCourseOwnership(undefined, ...) short-circuits to 403 without a courses DB query

      const res = await postUpdateMaterial(makeRequest({ attachmentId: UID.a1, role: "primary" }));

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    });

    it("returns 403 when assessment not found (assessment attachable, courseId unresolvable)", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // materialAttachments query → found, attachableType "assessment"
      mockDbSelect.mockReturnValueOnce(
        makeChain([
          {
            id: UID.a1,
            attachableType: "assessment",
            attachableId: UID.asDeleted,
            materialId: UID.m1,
            role: "supporting",
          },
        ]),
      );
      // topUnit query → empty (not a unit-direct attachable)
      mockDbSelect.mockReturnValueOnce(makeChain([]));
      // assessments query → assessment not found, courseId stays undefined
      mockDbSelect.mockReturnValueOnce(makeChain([]));
      // assertCourseOwnership(undefined, ...) short-circuits to 403 without a courses DB query

      const res = await postUpdateMaterial(makeRequest({ attachmentId: UID.a1, role: "primary" }));

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

    const PAYLOAD = { lessonId: UID.l1, fromUnitId: UID.u1, toUnitId: UID.u2, newSortOrder: 1 };

    it("returns 400 on a malformed JSON body", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      const res = await postMoveLesson(
        new Request("http://localhost/api/curriculum/editor/move-lesson", {
          method: "POST",
          body: "{not json",
        }),
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Invalid JSON body");
      expect(mockDbSelect).not.toHaveBeenCalled();
    });

    it("returns 400 when any id is not a UUID", async () => {
      mockGetServerSession.mockResolvedValue(SESSION_B);

      for (const override of [
        { lessonId: "lesson-1" },
        { fromUnitId: "unit-1" },
        { toUnitId: "unit-2" },
      ]) {
        const res = await postMoveLesson(makeRequest({ ...PAYLOAD, ...override }));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe("Invalid id");
      }
      expect(mockDbSelect).not.toHaveBeenCalled();
    });

    it("returns 400 when newSortOrder is not an integer in 1..10000", async () => {
      mockGetServerSession.mockResolvedValue(SESSION_B);

      for (const newSortOrder of [0, 1.5, 10001, "2"]) {
        const res = await postMoveLesson(makeRequest({ ...PAYLOAD, newSortOrder }));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe("Invalid newSortOrder");
      }
      expect(mockDbSelect).not.toHaveBeenCalled();
    });

    it("returns 401 when unauthenticated", async () => {
      mockGetServerSession.mockResolvedValueOnce(null);

      const res = await postMoveLesson(makeRequest(PAYLOAD));

      expect(res.status).toBe(401);
    });

    it("returns 403 when lessonId belongs to a different unit than fromUnitId (cross-unit IDOR)", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // lesson found, but unitId is u99 (victim's unit) — not the attacker's u1
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: UID.l1, unitId: UID.u99, sortOrder: 2 }]));

      const res = await postMoveLesson(makeRequest(PAYLOAD));

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    });

    it("returns 403 when session user does not own the source course", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // lesson query → found, unitId matches fromUnitId
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: UID.l1, unitId: UID.u1, sortOrder: 2 }]));
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
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: UID.l1, unitId: UID.u1, sortOrder: 2 }]));
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
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: UID.l1, unitId: UID.u1, sortOrder: 2 }]));
      // fromUnit not found
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postMoveLesson(makeRequest(PAYLOAD));

      expect(res.status).toBe(404);
    });

    it("returns 404 when the destination unit does not exist", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);
      // lesson found
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: UID.l1, unitId: UID.u1, sortOrder: 2 }]));
      // fromUnit found
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-B" }]));
      // source ownership → owned by B
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "course-owned-by-B" }]));
      // toUnit not found
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await postMoveLesson(makeRequest(PAYLOAD));

      expect(res.status).toBe(404);
    });

    it("sends all three sort-order writes as one atomic db.batch", async () => {
      const SESSION_A = { user: { email: "userA@school.edu" }, expires: "" };
      mockGetServerSession.mockResolvedValueOnce(SESSION_A);
      // lesson found
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: UID.l1, unitId: UID.u1, sortOrder: 2 }]));
      // fromUnit found
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // source ownership → owned by A
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "course-owned-by-A" }]));
      // toUnit found
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // dest ownership → owned by A
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "course-owned-by-A" }]));

      mockDbUpdate.mockReturnValue(makeChain(undefined));
      mockDbBatch.mockResolvedValue([]);
      // logEdit insert
      mockDbInsert.mockReturnValue(makeChain(undefined));

      const res = await postMoveLesson(makeRequest(PAYLOAD));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true });
      // db.update only builds statements; all three execute inside one batch
      expect(mockDbUpdate).toHaveBeenCalledTimes(3);
      expect(mockDbBatch).toHaveBeenCalledOnce();
      expect(mockDbBatch.mock.calls[0][0]).toHaveLength(3);
    });

    it("returns 500 and does not run logEdit when the batch rejects", async () => {
      const SESSION_A = { user: { email: "userA@school.edu" }, expires: "" };
      mockGetServerSession.mockResolvedValueOnce(SESSION_A);
      // lesson found
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: UID.l1, unitId: UID.u1, sortOrder: 2 }]));
      // fromUnit found
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // source ownership → owned by A
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "course-owned-by-A" }]));
      // toUnit found
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // dest ownership → owned by A
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "course-owned-by-A" }]));

      mockDbUpdate.mockReturnValue(makeChain(undefined));

      const dbError = new Error("DB write failed");
      // Batch rejects (simulates a write failure — neon rolls back the whole batch)
      mockDbBatch.mockRejectedValueOnce(dbError);

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await postMoveLesson(makeRequest(PAYLOAD));

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("Failed to move lesson");
      // logEdit is not reached — no insert after a failed batch
      expect(mockDbInsert).not.toHaveBeenCalled();
      // error is logged so it appears in Sentry / server logs
      // The failure is recorded via apiError() (error_events + Sentry), mocked here.
      expect(mockApiError).toHaveBeenCalledWith(expect.any(String), 500, "write_failed", expect.any(String), expect.objectContaining({ cause: dbError }));

      consoleErrorSpy.mockRestore();
    });

    it("returns 200 even when logEdit throws after the batch commits", async () => {
      const SESSION_A = { user: { email: "userA@school.edu" }, expires: "" };
      mockGetServerSession.mockResolvedValueOnce(SESSION_A);
      // lesson found
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: UID.l1, unitId: UID.u1, sortOrder: 2 }]));
      // fromUnit found
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // source ownership → owned by A
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "course-owned-by-A" }]));
      // toUnit found
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // dest ownership → owned by A
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "course-owned-by-A" }]));

      mockDbUpdate.mockReturnValue(makeChain(undefined));
      mockDbBatch.mockResolvedValueOnce([]);

      // logEdit insert rejects after the batch commits (simulates audit DB outage)
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

    const PAYLOAD = { assessmentId: UID.a1, fromUnitId: UID.u1, toUnitId: UID.u2, newSortOrder: 1 };

    it("returns 400 when an id is not a UUID or newSortOrder is out of range", async () => {
      mockGetServerSession.mockResolvedValue(SESSION_B);

      const badId = await postMoveAssessment(
        makeRequest({ ...PAYLOAD, assessmentId: "assessment-1" }),
      );
      expect(badId.status).toBe(400);
      expect((await badId.json()).error).toBe("Invalid id");

      const badSort = await postMoveAssessment(makeRequest({ ...PAYLOAD, newSortOrder: 0 }));
      expect(badSort.status).toBe(400);
      expect((await badSort.json()).error).toBe("Invalid newSortOrder");

      expect(mockDbSelect).not.toHaveBeenCalled();
    });

    it("returns 401 when unauthenticated", async () => {
      mockGetServerSession.mockResolvedValueOnce(null);

      const res = await postMoveAssessment(makeRequest(PAYLOAD));

      expect(res.status).toBe(401);
    });

    it("returns 403 when assessmentId belongs to a different unit than fromUnitId (cross-unit IDOR)", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);
      // assessment found, but unitId is u99 (victim's unit) — not the attacker's u1
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: UID.a1, unitId: UID.u99, sortOrder: 2 }]));

      const res = await postMoveAssessment(makeRequest(PAYLOAD));

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    });

    it("returns 403 when session user does not own the source course", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION_B);

      // assessment query → found, unitId matches fromUnitId
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: UID.a1, unitId: UID.u1, sortOrder: 2 }]));
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
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: UID.a1, unitId: UID.u1, sortOrder: 2 }]));
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

    it("sends all three sort-order writes as one atomic db.batch", async () => {
      const SESSION_A = { user: { email: "userA@school.edu" }, expires: "" };
      mockGetServerSession.mockResolvedValueOnce(SESSION_A);
      // assessment found
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: UID.a1, unitId: UID.u1, sortOrder: 2 }]));
      // fromUnit found
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // source ownership → owned by A
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "course-owned-by-A" }]));
      // toUnit found
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // dest ownership → owned by A
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "course-owned-by-A" }]));

      mockDbUpdate.mockReturnValue(makeChain(undefined));
      mockDbBatch.mockResolvedValue([]);
      // logEdit insert
      mockDbInsert.mockReturnValue(makeChain(undefined));

      const res = await postMoveAssessment(makeRequest(PAYLOAD));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true });
      // db.update only builds statements; all three execute inside one batch
      expect(mockDbUpdate).toHaveBeenCalledTimes(3);
      expect(mockDbBatch).toHaveBeenCalledOnce();
      expect(mockDbBatch.mock.calls[0][0]).toHaveLength(3);
    });

    it("returns 500 and does not run logEdit when the batch rejects", async () => {
      const SESSION_A = { user: { email: "userA@school.edu" }, expires: "" };
      mockGetServerSession.mockResolvedValueOnce(SESSION_A);
      // assessment found
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: UID.a1, unitId: UID.u1, sortOrder: 2 }]));
      // fromUnit found
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // source ownership → owned by A
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "course-owned-by-A" }]));
      // toUnit found
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // dest ownership → owned by A
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "course-owned-by-A" }]));

      mockDbUpdate.mockReturnValue(makeChain(undefined));

      const dbError = new Error("DB write failed");
      // Batch rejects (simulates a write failure — neon rolls back the whole batch)
      mockDbBatch.mockRejectedValueOnce(dbError);

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await postMoveAssessment(makeRequest(PAYLOAD));

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("Failed to move assessment");
      // logEdit is not reached — no insert after a failed batch
      expect(mockDbInsert).not.toHaveBeenCalled();
      // error is logged so it appears in Sentry / server logs
      // The failure is recorded via apiError() (error_events + Sentry), mocked here.
      expect(mockApiError).toHaveBeenCalledWith(expect.any(String), 500, "write_failed", expect.any(String), expect.objectContaining({ cause: dbError }));

      consoleErrorSpy.mockRestore();
    });

    it("returns 200 even when logEdit throws after the batch commits", async () => {
      const SESSION_A = { user: { email: "userA@school.edu" }, expires: "" };
      mockGetServerSession.mockResolvedValueOnce(SESSION_A);
      // assessment found
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: UID.a1, unitId: UID.u1, sortOrder: 2 }]));
      // fromUnit found
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // source ownership → owned by A
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "course-owned-by-A" }]));
      // toUnit found
      mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: "course-owned-by-A" }]));
      // dest ownership → owned by A
      mockDbSelect.mockReturnValueOnce(makeChain([{ id: "course-owned-by-A" }]));

      mockDbUpdate.mockReturnValue(makeChain(undefined));
      mockDbBatch.mockResolvedValueOnce([]);

      // logEdit insert rejects after the batch commits (simulates audit DB outage)
      const logEditError = new Error("audit DB outage");
      mockDbInsert.mockImplementationOnce(() => ({ values: () => Promise.reject(logEditError) }));

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await postMoveAssessment(makeRequest(PAYLOAD));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true });
      // logEdit failure is logged but does not fail the request
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[move-assessment] logEdit failed:",
        logEditError,
      );
      consoleErrorSpy.mockRestore();
    });
  });
});
