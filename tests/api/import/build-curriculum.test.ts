import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks (must be initialized before any import runs) ──────────
const { mockDbSelect, mockDbInsert, mockDbDelete, mockMessagesCreate } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbDelete: vi.fn(),
  mockMessagesCreate: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limit", () => ({
  checkAiRateLimit: vi.fn().mockResolvedValue(null),
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    // The route now streams: getAnthropic().messages.stream(cfg).finalMessage().
    // Route the config through mockMessagesCreate so the existing .mockResolvedValue
    // response setup and the call-arg assertions keep working unchanged.
    messages = {
      stream: (...args: unknown[]) => ({
        finalMessage: () => mockMessagesCreate(...args),
      }),
    };
  },
}));

vi.mock("@/db", () => ({
  db: { select: mockDbSelect, insert: mockDbInsert, delete: mockDbDelete },
}));
vi.mock("@/db/schema", () => ({
  courses: {},
  units: {},
  lessons: {},
  assessments: {},
  standards: {},
  unitStandards: {},
  lessonStandards: {},
  materials: {},
  materialAttachments: {},
  driveFolders: {},
  schoolYears: {},
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  asc: vi.fn(),
  inArray: vi.fn(),
  and: vi.fn(),
  isNull: vi.fn(),
  or: vi.fn(),
}));

// ── Imports after mocks ─────────────────────────────────────────────────
import { getServerSession } from "next-auth";
import { eq } from "drizzle-orm";
import { POST } from "../../../src/app/api/import/build-curriculum/route";

const mockGetServerSession = vi.mocked(getServerSession);
const mockEq = vi.mocked(eq);

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
const CREATED_LESSON = { id: "l1", sortOrder: 1 }; // sortOrder must match the primed lesson (#583 maps ids by sortOrder)

const AI_RESPONSE = {
  units: [
    {
      title: "Reading Unit",
      durationWeeks: 4,
      summary: "Students read and analyze literature.",
      essentialQuestions: "What is the main idea?",
      anchorTexts: "Unit Overview",
      contentWarnings: null,
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
    },
  ],
};

/**
 * Sets up the db mock sequences for the course select-first/insert test cases.
 *
 * Select call order (shared prefix):
 *   1. driveFolders
 *   2. materials
 *   3. standards
 *   4. schoolYears
 *   5. courses select-first lookup (courseSelectReturn)
 *   6. courses race-fallback SELECT (only when courseFallbackReturn provided)
 *   next: units existingUnits (only when a course was ultimately found)
 *
 * Insert call order:
 *   1. courses (only when the select-first lookup found nothing)
 *   If a course was found:
 *   2. units
 *   3. unitStandards
 *   4. lessons
 *   5. lessonStandards
 *   6. materialAttachments
 */
function setupMocks({
  courseSelectReturn = [],
  courseInsertReturn = [],
  courseFallbackReturn,
}: {
  courseSelectReturn?: unknown[];
  courseInsertReturn?: unknown[];
  courseFallbackReturn?: unknown[];
}) {
  const courseFound =
    courseSelectReturn.length > 0 ||
    courseInsertReturn.length > 0 ||
    (courseFallbackReturn !== undefined && courseFallbackReturn.length > 0);

  mockDbSelect.mockReset();
  mockDbSelect
    .mockReturnValueOnce(makeChain([SCHOOL_YEAR])) // 0a. early guard (#611): schoolYears
    .mockReturnValueOnce(makeChain([])) // 0b. early guard: course lookup → none yet
    .mockReturnValueOnce(makeChain([FOLDER])) // 1. driveFolders
    .mockReturnValueOnce(makeChain([MATERIAL])) // 2. materials
    .mockReturnValueOnce(makeChain([STANDARD])) // 3. standards
    .mockReturnValueOnce(makeChain([SCHOOL_YEAR])) // 4. schoolYears
    .mockReturnValueOnce(makeChain(courseSelectReturn)); // 5. courses select-first

  if (courseFallbackReturn !== undefined) {
    mockDbSelect.mockReturnValueOnce(makeChain(courseFallbackReturn)); // 6. courses race fallback
  }
  if (courseFound) {
    mockDbSelect.mockReturnValueOnce(makeChain([])); // existingUnits
  }

  mockDbInsert.mockReset();
  if (courseSelectReturn.length === 0) {
    mockDbInsert.mockReturnValueOnce(makeChain(courseInsertReturn)); // courses insert
  }

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

  it("returns 401 JSON when there is no session", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 401 JSON when session has no email", async () => {
    mockGetServerSession.mockResolvedValue({ user: {} });

    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 400 on a malformed JSON body", async () => {
    const res = await POST(
      new Request("http://localhost/api/import/build-curriculum", {
        method: "POST",
        body: "{not json",
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid JSON body");
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it("returns 400 when grade or quarter is invalid", async () => {
    for (const payload of [
      { grade: "5", quarter: "Q1" }, // grade must be a number
      { grade: 0, quarter: "Q1" }, // falsy grade
      { quarter: "Q1" }, // missing grade
      { grade: 5, quarter: "" }, // empty quarter
      { grade: 5, quarter: "Q1-extra-long" }, // quarter > 10 chars
      { grade: 5 }, // missing quarter
    ]) {
      const res = await POST(
        new Request("http://localhost/api/import/build-curriculum", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        }),
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("grade and quarter required");
    }
    expect(mockDbSelect).not.toHaveBeenCalled();
    expect(mockMessagesCreate).not.toHaveBeenCalled();
  });

  it("returns structured 500 JSON when getServerSession throws", async () => {
    mockGetServerSession.mockRejectedValue(new Error("JWT decode failure"));

    const res = await POST(makeRequest());

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("parses an AI response wrapped in ```json markdown fences (#582)", async () => {
    // The model sometimes ignores "no fencing" and wraps the JSON in a code
    // block. The route slices to the outermost braces, so this must still work.
    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "```json\n" + JSON.stringify(AI_RESPONSE) + "\n```" }],
    });
    setupMocks({ courseSelectReturn: [{ id: "c1" }] });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.unitCount).toBe(1);
    expect(body.units[0].id).toBe(CREATED_UNIT.id);
  });

  describe("faithful mode (teacher's unit folders)", () => {
    it("builds units from sourceUnit folders with source 'human', AI fills the gaps", async () => {
      mockMessagesCreate.mockResolvedValueOnce({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              units: [
                {
                  title: "The Giver",
                  durationWeeks: 5,
                  summary: "Students read The Giver.",
                  essentialQuestions: "",
                  anchorTexts: "The Giver",
                  contentWarnings: null,
                  lessons: [
                    {
                      sortOrder: 1,
                      title: "Intro",
                      durationMinutes: 45,
                      objectives: ["o"],
                      activities: ["a"],
                      standards: [{ id: "5.RL.1", coverageType: "teaches" }],
                      materials: [{ title: "Giver Ch1", role: "primary" }],
                    },
                  ],
                  unitStandards: ["5.RL.1"],
                },
              ],
            }),
          },
        ],
      });

      mockDbSelect.mockReset();
      mockDbSelect
        .mockReturnValueOnce(makeChain([SCHOOL_YEAR])) // 0a. early guard (#611): schoolYears
        .mockReturnValueOnce(makeChain([])) // 0b. early guard: course lookup → none yet
        .mockReturnValueOnce(makeChain([FOLDER]))
        .mockReturnValueOnce(
          makeChain([
            {
              id: "mat1",
              title: "Giver Ch1",
              materialType: "reading",
              driveFolderId: "drive1",
              sourceUnit: "The Giver",
            },
          ]),
        )
        .mockReturnValueOnce(makeChain([STANDARD]))
        .mockReturnValueOnce(makeChain([SCHOOL_YEAR]))
        .mockReturnValueOnce(makeChain([{ id: "c1" }])) // course found
        .mockReturnValueOnce(makeChain([])); // existingUnits

      const unitChain = makeChain([CREATED_UNIT]);
      const unitValuesSpy = vi.fn().mockReturnValue(unitChain);
      unitChain.values = unitValuesSpy;

      mockDbInsert.mockReset();
      mockDbInsert
        .mockReturnValueOnce(unitChain) // units
        .mockReturnValueOnce(makeChain([])) // unitStandards
        .mockReturnValueOnce(makeChain([CREATED_LESSON])) // lessons
        .mockReturnValueOnce(makeChain([])) // lessonStandards
        .mockReturnValueOnce(makeChain([])); // materialAttachments

      const res = await POST(makeRequest());

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.mode).toBe("faithful");
      expect(body.unitCount).toBe(1);
      expect(body.units[0].title).toBe("The Giver");
      // The unit's title/boundary is hers → source 'human', not 'ai'.
      expect(unitValuesSpy.mock.calls[0][0]).toMatchObject({ title: "The Giver", source: "human" });
    });

    it("forwards referenceText into the AI prompt and stores it on a new course", async () => {
      // Fallback grouping (no sourceUnit) keeps this focused on the reference plumbing.
      mockDbSelect.mockReset();
      mockDbSelect
        .mockReturnValueOnce(makeChain([SCHOOL_YEAR])) // 0a. early guard (#611): schoolYears
        .mockReturnValueOnce(makeChain([])) // 0b. early guard: course lookup → none yet
        .mockReturnValueOnce(makeChain([FOLDER]))
        .mockReturnValueOnce(makeChain([MATERIAL]))
        .mockReturnValueOnce(makeChain([STANDARD]))
        .mockReturnValueOnce(makeChain([SCHOOL_YEAR]))
        .mockReturnValueOnce(makeChain([])) // course select-first → not found
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
        .mockReturnValue(makeChain([])); // lessonStandards + materialAttachments

      const res = await POST(
        new Request("http://localhost/api/import/build-curriculum", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            grade: 5,
            quarter: "Q1",
            referenceText: "PACING: 2 weeks per novel.",
          }),
        }),
      );

      expect(res.status).toBe(200);
      // Reference text reached the model prompt…
      const userContent = mockMessagesCreate.mock.calls[0][0].messages[0].content as string;
      expect(userContent).toContain("PACING: 2 weeks per novel.");
      // …and was stored on the new course for provenance.
      expect(courseValuesSpy.mock.calls[0][0]).toMatchObject({
        teacherNotes: "PACING: 2 weeks per novel.",
      });
    });
  });

  describe("course select-first / insert race paths", () => {
    it("uses the existing course from the select-first lookup without inserting a course", async () => {
      setupMocks({ courseSelectReturn: [{ id: "c1" }] });

      const res = await POST(makeRequest());

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.unitCount).toBe(1);
      expect(body.units[0].id).toBe(CREATED_UNIT.id);
      // 8 selects: early guard (schoolYears, course) + folders, materials,
      // standards, schoolYears, courses, existingUnits
      expect(mockDbSelect).toHaveBeenCalledTimes(8);
      // No courses insert — units, unitStandards, lessons, lessonStandards, materialAttachments
      expect(mockDbInsert).toHaveBeenCalledTimes(5);
    });

    it("inserts the course when the select-first lookup finds nothing", async () => {
      setupMocks({ courseSelectReturn: [], courseInsertReturn: [{ id: "c1" }] });

      const res = await POST(makeRequest());

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.unitCount).toBe(1);
      expect(body.units[0].id).toBe(CREATED_UNIT.id);
      // Fallback SELECT should NOT have been called — 6 selects total
      // (folders, materials, standards, schoolYears, courses select-first, existingUnits)
      expect(mockDbSelect).toHaveBeenCalledTimes(8); // +2 for the early guard (#611)
    });

    it("scopes DB lookups by the session ownerEmail (#142)", async () => {
      setupMocks({ courseInsertReturn: [{ id: "c1" }] });

      await POST(makeRequest());

      // The driveFolders folder lookup and the course query both filter by the
      // caller's email — eq() must have been invoked with the session email.
      const eqSecondArgs = mockEq.mock.calls.map((c) => c[1]);
      expect(eqSecondArgs).toContain("teacher@school.edu");
    });

    it("falls back to SELECT and succeeds when the insert loses a concurrent race", async () => {
      setupMocks({
        courseSelectReturn: [], // select-first finds nothing
        courseInsertReturn: [], // insert returns nothing (concurrent winner exists)
        courseFallbackReturn: [{ id: "c1" }], // fallback SELECT finds the winner's row
      });

      const res = await POST(makeRequest());

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.unitCount).toBe(1);
      expect(body.units[0].id).toBe(CREATED_UNIT.id);
      // Fallback SELECT must have been called — 7 selects total
      expect(mockDbSelect).toHaveBeenCalledTimes(9); // +2 for the early guard (#611)
    });

    it("propagates session.user.id to the unit INSERT so ownership is enforced", async () => {
      mockGetServerSession.mockResolvedValue({
        user: { id: "user-alice", email: "alice@school.edu", name: "Teacher" },
      });

      mockDbSelect.mockReset();
      mockDbSelect
        .mockReturnValueOnce(makeChain([SCHOOL_YEAR])) // 0a. early guard (#611): schoolYears
        .mockReturnValueOnce(makeChain([])) // 0b. early guard: course lookup → none yet
        .mockReturnValueOnce(makeChain([FOLDER]))
        .mockReturnValueOnce(makeChain([MATERIAL]))
        .mockReturnValueOnce(makeChain([STANDARD]))
        .mockReturnValueOnce(makeChain([SCHOOL_YEAR]))
        .mockReturnValueOnce(makeChain([])) // courses select-first → not found
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
        .mockReturnValueOnce(makeChain([SCHOOL_YEAR])) // 0a. early guard (#611): schoolYears
        .mockReturnValueOnce(makeChain([])) // 0b. early guard: course lookup → none yet
        .mockReturnValueOnce(makeChain([FOLDER]))
        .mockReturnValueOnce(makeChain([MATERIAL]))
        .mockReturnValueOnce(makeChain([STANDARD]))
        .mockReturnValueOnce(makeChain([SCHOOL_YEAR]))
        .mockReturnValueOnce(makeChain([])) // courses select-first → not found
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

    it("fallback SELECT filters by schoolYearId so races resolve to the correct school year", async () => {
      const { eq: mockEq } = await import("drizzle-orm");
      vi.mocked(mockEq).mockClear();

      setupMocks({
        courseSelectReturn: [], // select-first finds nothing
        courseInsertReturn: [], // insert loses to a concurrent race
        courseFallbackReturn: [{ id: "c1" }], // fallback finds the right course
      });

      await POST(makeRequest());

      // eq must have been called with the current school year id in the WHERE clause
      const eqSecondArgs = vi.mocked(mockEq).mock.calls.map((c) => c[1]);
      expect(eqSecondArgs).toContain(SCHOOL_YEAR.id);
    });

    it("returns 500 gracefully when select, insert, and fallback SELECT all return nothing", async () => {
      setupMocks({
        courseSelectReturn: [], // select-first finds nothing
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

  describe("coverageType allowlist", () => {
    // Normal AI_RESPONSE has 1 lesson with 1 standard and 1 material.
    // Insert call order: courses(1) + units(1) + unitStandards(1) + lessons(1)
    //   + lessonStandards(1) + materialAttachments(1) = 6 total.
    // When coverageType is invalid, lessonStandards is skipped → 5 inserts.

    function setupCoverageTypeTest(coverageType: string) {
      const response = {
        units: [
          {
            ...AI_RESPONSE.units[0],
            lessons: [
              { ...AI_RESPONSE.units[0].lessons[0], standards: [{ id: "5.RL.1", coverageType }] },
            ],
          },
        ],
      };
      mockMessagesCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: JSON.stringify(response) }],
      });
      mockDbSelect.mockReset();
      mockDbSelect
        .mockReturnValueOnce(makeChain([SCHOOL_YEAR])) // 0a. early guard (#611): schoolYears
        .mockReturnValueOnce(makeChain([])) // 0b. early guard: course lookup → none yet
        .mockReturnValueOnce(makeChain([FOLDER]))
        .mockReturnValueOnce(makeChain([MATERIAL]))
        .mockReturnValueOnce(makeChain([STANDARD]))
        .mockReturnValueOnce(makeChain([SCHOOL_YEAR]))
        .mockReturnValueOnce(makeChain([])) // courses select-first → not found
        .mockReturnValueOnce(makeChain([])); // existingUnits
      mockDbInsert.mockReset();
      mockDbInsert
        .mockReturnValueOnce(makeChain([{ id: "c1" }])) // courses
        .mockReturnValueOnce(makeChain([CREATED_UNIT])) // units
        .mockReturnValueOnce(makeChain([])) // unitStandards
        .mockReturnValueOnce(makeChain([CREATED_LESSON])) // lessons
        .mockReturnValue(makeChain([])); // lessonStandards + materialAttachments
    }

    it("skips lessonStandards rows whose AI-returned coverageType is not in the allowlist", async () => {
      setupCoverageTypeTest("hacked");

      const res = await POST(makeRequest());

      expect(res.status).toBe(200);
      // courses + units + unitStandards + lessons + materialAttachments = 5 (lessonStandards skipped)
      expect(mockDbInsert).toHaveBeenCalledTimes(5);
    });

    it.each(["introduces", "teaches", "reinforces", "assesses"])(
      "accepts valid coverageType %s",
      async (ct) => {
        setupCoverageTypeTest(ct);

        const res = await POST(makeRequest());

        expect(res.status).toBe(200);
        // courses + units + unitStandards + lessons + lessonStandards + materialAttachments = 6
        expect(mockDbInsert).toHaveBeenCalledTimes(6);
      },
    );
  });

  describe("batched inserts (#583)", () => {
    it("inserts many lessons in ONE call per table, not one per row", async () => {
      const twoLessonResponse = {
        units: [
          {
            ...AI_RESPONSE.units[0],
            lessons: [
              AI_RESPONSE.units[0].lessons[0],
              {
                ...AI_RESPONSE.units[0].lessons[0],
                sortOrder: 2,
                title: "Lesson Two",
              },
            ],
          },
        ],
      };
      mockMessagesCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: JSON.stringify(twoLessonResponse) }],
      });
      mockDbSelect.mockReset();
      mockDbSelect
        .mockReturnValueOnce(makeChain([SCHOOL_YEAR])) // 0a. early guard (#611)
        .mockReturnValueOnce(makeChain([])) // 0b. early guard: no course yet
        .mockReturnValueOnce(makeChain([FOLDER]))
        .mockReturnValueOnce(makeChain([MATERIAL]))
        .mockReturnValueOnce(makeChain([STANDARD]))
        .mockReturnValueOnce(makeChain([SCHOOL_YEAR]))
        .mockReturnValueOnce(makeChain([])) // courses select-first → not found
        .mockReturnValueOnce(makeChain([])); // existingUnits

      const lessonsValuesSpy = vi.fn();
      lessonsValuesSpy.mockReturnValue({
        returning: () =>
          Promise.resolve([
            { id: "l1", sortOrder: 1 },
            { id: "l2", sortOrder: 2 },
          ]),
      });
      mockDbInsert.mockReset();
      mockDbInsert
        .mockReturnValueOnce(makeChain([{ id: "c1" }])) // courses
        .mockReturnValueOnce(makeChain([CREATED_UNIT])) // units
        .mockReturnValueOnce(makeChain([])) // unitStandards
        .mockReturnValueOnce({ values: lessonsValuesSpy }) // lessons (batched)
        .mockReturnValueOnce(makeChain([])) // lessonStandards (batched)
        .mockReturnValueOnce(makeChain([])); // materialAttachments (batched)

      const res = await POST(makeRequest());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.lessonCount).toBe(2);
      // Both lessons went through a single values() call...
      expect(lessonsValuesSpy).toHaveBeenCalledTimes(1);
      expect(lessonsValuesSpy.mock.calls[0][0]).toHaveLength(2);
      // ...and the total insert count is one per table, not one per row.
      expect(mockDbInsert).toHaveBeenCalledTimes(6);
    });
  });

  describe("idempotency (re-running Build)", () => {
    it("refuses to duplicate an already-built quarter and inserts nothing", async () => {
      mockDbSelect.mockReset();
      mockDbSelect
        .mockReturnValueOnce(makeChain([SCHOOL_YEAR])) // 0a. early guard (#611): schoolYears
        .mockReturnValueOnce(makeChain([])) // 0b. early guard: course lookup → none yet
        .mockReturnValueOnce(makeChain([FOLDER]))
        .mockReturnValueOnce(makeChain([MATERIAL]))
        .mockReturnValueOnce(makeChain([STANDARD]))
        .mockReturnValueOnce(makeChain([SCHOOL_YEAR]))
        .mockReturnValueOnce(makeChain([{ id: "c1" }])) // course found
        // existingUnits: this quarter already has a unit → already built
        .mockReturnValueOnce(makeChain([{ id: "u-old", sortOrder: 1, quarter: "Q1" }]));

      mockDbInsert.mockReset();

      const res = await POST(makeRequest());

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.alreadyBuilt).toBe(true);
      expect(body.courseId).toBe("c1");
      expect(body.unitCount).toBe(1);
      // The whole point of the guard: no duplicate units created.
      expect(mockDbInsert).not.toHaveBeenCalled();
    });

    it("early guard (#611): refuses BEFORE the AI call when the quarter is already built", async () => {
      mockMessagesCreate.mockClear();
      mockDbSelect.mockReset();
      mockDbSelect
        .mockReturnValueOnce(makeChain([SCHOOL_YEAR])) // 0a. schoolYears
        .mockReturnValueOnce(makeChain([{ id: "c1" }])) // 0b. course found
        .mockReturnValueOnce(makeChain([{ id: "u-old" }])); // 0c. quarter already built
      mockDbInsert.mockReset();

      const res = await POST(makeRequest());

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.alreadyBuilt).toBe(true);
      expect(body.courseId).toBe("c1");
      expect(body.unitCount).toBe(1);
      // What #611 buys: the expensive model call never happens.
      expect(mockMessagesCreate).not.toHaveBeenCalled();
      expect(mockDbInsert).not.toHaveBeenCalled();
    });

    it("rebuild:true clears the quarter's existing units, then builds fresh", async () => {
      mockDbSelect.mockReset();
      // rebuild:true bypasses the early idempotency guard (#611) — no 0a/0b rows.
      mockDbSelect
        .mockReturnValueOnce(makeChain([FOLDER]))
        .mockReturnValueOnce(makeChain([MATERIAL]))
        .mockReturnValueOnce(makeChain([STANDARD]))
        .mockReturnValueOnce(makeChain([SCHOOL_YEAR]))
        .mockReturnValueOnce(makeChain([{ id: "c1" }])) // course found
        .mockReturnValueOnce(makeChain([{ id: "u-old", sortOrder: 1, quarter: "Q1" }])) // existingUnits
        .mockReturnValueOnce(makeChain([])) // staleLessons (none)
        .mockReturnValueOnce(makeChain([])); // staleAssessments (none)

      mockDbDelete.mockReset();
      mockDbDelete.mockReturnValue(makeChain([])); // unit-attachment delete + units delete

      mockDbInsert.mockReset();
      mockDbInsert
        .mockReturnValueOnce(makeChain([CREATED_UNIT])) // units
        .mockReturnValueOnce(makeChain([])) // unitStandards
        .mockReturnValueOnce(makeChain([CREATED_LESSON])) // lessons
        .mockReturnValueOnce(makeChain([])) // lessonStandards
        .mockReturnValueOnce(makeChain([])); // materialAttachments

      const res = await POST(
        new Request("http://localhost/api/import/build-curriculum", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ grade: 5, quarter: "Q1", rebuild: true }),
        }),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.alreadyBuilt).toBeUndefined();
      expect(body.unitCount).toBe(1);
      // Stale units cleared: unit-attachment delete + units delete both fired
      // (lesson/assessment attachment deletes are skipped when there are none).
      expect(mockDbDelete).toHaveBeenCalledTimes(2);
    });
  });
});
