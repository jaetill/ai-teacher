import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks (must be initialized before any import runs) ──────────
const { mockDbSelect, mockDbInsert, mockMessagesCreate } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockMessagesCreate: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockMessagesCreate };
  },
}));

vi.mock("@/db", () => ({ db: { select: mockDbSelect, insert: mockDbInsert } }));
vi.mock("@/db/schema", () => ({
  courses: {},
  units: {},
  lessons: {},
  standards: {},
  unitStandards: {},
  lessonStandards: {},
  materials: {},
  materialAttachments: {},
  driveFolders: {},
  schoolYears: {},
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  asc: vi.fn(),
  inArray: vi.fn(),
}));

// ── Imports after mocks ─────────────────────────────────────────────────
import { getServerSession } from "next-auth";
import { and, eq } from "drizzle-orm";
import { POST } from "../../../src/app/api/import/build-curriculum/route";

const mockGetServerSession = vi.mocked(getServerSession);

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Returns a Drizzle-like thenable chain that resolves with `value` when
 * awaited at any point in the chain (select/from/where/limit/insert/values/
 * onConflictDoNothing/returning all return the same chain object).
 */
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
  chain.then = (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => p.then(r, j);
  chain.catch = (j: (e: unknown) => unknown) => p.catch(j);
  chain.finally = (fn: () => void) => p.finally(fn);
  return chain;
}

const FOLDER = { folderKey: "grade_5_Q1_Curriculum", driveId: "drive1" };
const MATERIAL = {
  id: "mat1",
  title: "Unit Overview",
  materialType: "document",
  driveFolderId: "drive1",
};
const STANDARD = { id: "5.RL.1", description: "Read and comprehend literature" };
const SCHOOL_YEAR = { id: "sy1" };
const CREATED_UNIT = { id: "u1" };
const CREATED_LESSON = { id: "l1" };

const AI_RESPONSE = {
  unit: {
    title: "Reading Unit",
    durationWeeks: 4,
    summary: "Students read and analyze literature.",
    essentialQuestions: "What is the main idea?",
    anchorTexts: "Unit Overview",
    contentWarnings: null,
  },
  lessons: [
    {
      sortOrder: 1,
      title: "Introduction",
      durationMinutes: 45,
      objectives: ["Identify main idea"],
      activities: ["Read aloud"],
      standards: [{ id: "5.RL.1", coverageType: "teaches" }],
      materials: [{ title: "Unit Overview", role: "primary" }],
    },
  ],
  unitStandards: ["5.RL.1"],
};

/**
 * Sets up the db mock sequences for the three course-upsert test cases.
 *
 * Select call order (shared prefix):
 *   1. driveFolders
 *   2. materials
 *   3. standards
 *   4. schoolYears
 *   5. courses fallback SELECT (only when courseInsertReturn is [])
 *   5 or 6. units existingUnits (only when a course was ultimately found)
 *
 * Insert call order:
 *   1. courses (the result we're testing)
 *   If a course was found:
 *   2. units
 *   3. unitStandards
 *   4. lessons
 *   5. lessonStandards
 *   6. materialAttachments
 */
function setupMocks({
  courseInsertReturn,
  courseFallbackReturn,
}: {
  courseInsertReturn: unknown[];
  courseFallbackReturn?: unknown[];
}) {
  const courseFound =
    courseInsertReturn.length > 0 ||
    (courseFallbackReturn !== undefined && courseFallbackReturn.length > 0);

  mockDbSelect.mockReset();
  mockDbSelect
    .mockReturnValueOnce(makeChain([FOLDER])) // 1. driveFolders
    .mockReturnValueOnce(makeChain([MATERIAL])) // 2. materials
    .mockReturnValueOnce(makeChain([STANDARD])) // 3. standards
    .mockReturnValueOnce(makeChain([SCHOOL_YEAR])); // 4. schoolYears

  if (courseFallbackReturn !== undefined) {
    mockDbSelect.mockReturnValueOnce(makeChain(courseFallbackReturn)); // 5. courses fallback
  }
  if (courseFound) {
    mockDbSelect.mockReturnValueOnce(makeChain([])); // existingUnits
  }

  mockDbInsert.mockReset();
  mockDbInsert.mockReturnValueOnce(makeChain(courseInsertReturn)); // courses insert

  if (courseFound) {
    mockDbInsert
      .mockReturnValueOnce(makeChain([CREATED_UNIT])) // units
      .mockReturnValueOnce(makeChain([])) // unitStandards (void)
      .mockReturnValueOnce(makeChain([CREATED_LESSON])) // lessons
      .mockReturnValueOnce(makeChain([])) // lessonStandards (void)
      .mockReturnValueOnce(makeChain([])); // materialAttachments (void)
  }
}

function makeRequest() {
  return new Request("http://localhost/api/import/build-curriculum", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grade: 5, quarter: "Q1" }),
  });
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("POST /api/import/build-curriculum", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({
      user: { email: "teacher@school.edu", name: "Teacher" },
    });
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify(AI_RESPONSE) }],
    });
  });

  it("returns 401 when there is no session", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
  });

  it("returns 401 when session has no email", async () => {
    mockGetServerSession.mockResolvedValue({ user: {} });

    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
  });

  describe("course upsert race paths", () => {
    it("uses the course from the insert when the row is returned (no concurrent race)", async () => {
      setupMocks({ courseInsertReturn: [{ id: "c1" }] });

      const res = await POST(makeRequest());

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.unitId).toBe(CREATED_UNIT.id);
      // Fallback SELECT should NOT have been called — only 5 selects total
      // (folders, materials, standards, schoolYears, existingUnits)
      expect(mockDbSelect).toHaveBeenCalledTimes(5);
    });

    it("falls back to SELECT and succeeds when the insert loses a concurrent race", async () => {
      setupMocks({
        courseInsertReturn: [], // insert returns nothing (row existed)
        courseFallbackReturn: [{ id: "c1" }], // fallback SELECT finds the winner's row
      });

      const res = await POST(makeRequest());

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.unitId).toBe(CREATED_UNIT.id);
      // Fallback SELECT must have been called — 6 selects total
      expect(mockDbSelect).toHaveBeenCalledTimes(6);
      // Fallback SELECT must scope by ownerEmail to prevent IDOR (#143).
      // Schema props are undefined in the mock, so inspect the second arg
      // (the predicate value) across all eq() calls.
      expect(vi.mocked(and)).toHaveBeenCalled();
      expect(vi.mocked(eq).mock.calls.map(([, v]) => v)).toContain("teacher@school.edu");
    });

    it("propagates session.user.id to the unit INSERT so ownership is enforced", async () => {
      mockGetServerSession.mockResolvedValue({
        user: { id: "user-alice", email: "alice@school.edu", name: "Teacher" },
      });

      mockDbSelect.mockReset();
      mockDbSelect
        .mockReturnValueOnce(makeChain([FOLDER]))
        .mockReturnValueOnce(makeChain([MATERIAL]))
        .mockReturnValueOnce(makeChain([STANDARD]))
        .mockReturnValueOnce(makeChain([SCHOOL_YEAR]))
        .mockReturnValueOnce(makeChain([])); // existingUnits

      const unitChain = makeChain([CREATED_UNIT]);
      const unitValuesSpy = vi.fn().mockReturnValue(unitChain);
      unitChain.values = unitValuesSpy;

      mockDbInsert.mockReset();
      mockDbInsert
        .mockReturnValueOnce(makeChain([{ id: "c1" }])) // courses
        .mockReturnValueOnce(unitChain) // units
        .mockReturnValueOnce(makeChain([])) // unitStandards
        .mockReturnValueOnce(makeChain([CREATED_LESSON])) // lessons
        .mockReturnValueOnce(makeChain([])) // lessonStandards
        .mockReturnValueOnce(makeChain([])); // materialAttachments

      await POST(makeRequest());

      expect(unitValuesSpy).toHaveBeenCalledOnce();
      expect(unitValuesSpy.mock.calls[0][0]).toMatchObject({ userId: "user-alice" });
    });

    it("stamps ownerEmail on course INSERT so IDOR cannot occur", async () => {
      mockDbSelect.mockReset();
      mockDbSelect
        .mockReturnValueOnce(makeChain([FOLDER]))
        .mockReturnValueOnce(makeChain([MATERIAL]))
        .mockReturnValueOnce(makeChain([STANDARD]))
        .mockReturnValueOnce(makeChain([SCHOOL_YEAR]))
        .mockReturnValueOnce(makeChain([])); // existingUnits

      const courseChain = makeChain([{ id: "c1" }]);
      const courseValuesSpy = vi.fn().mockReturnValue(courseChain);
      courseChain.values = courseValuesSpy;

      mockDbInsert.mockReset();
      mockDbInsert
        .mockReturnValueOnce(courseChain) // courses
        .mockReturnValueOnce(makeChain([CREATED_UNIT])) // units
        .mockReturnValueOnce(makeChain([])) // unitStandards
        .mockReturnValueOnce(makeChain([CREATED_LESSON])) // lessons
        .mockReturnValueOnce(makeChain([])) // lessonStandards
        .mockReturnValueOnce(makeChain([])); // materialAttachments

      await POST(makeRequest());

      expect(courseValuesSpy).toHaveBeenCalledOnce();
      expect(courseValuesSpy.mock.calls[0][0]).toMatchObject({ ownerEmail: "teacher@school.edu" });
    });

    it("returns 500 gracefully when both insert and fallback SELECT return nothing", async () => {
      setupMocks({
        courseInsertReturn: [], // insert returns nothing
        courseFallbackReturn: [], // fallback also returns nothing
      });

      const res = await POST(makeRequest());

      // Must be a graceful 500, not an unhandled TypeError crash
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBeTruthy();
    });
  });
});
