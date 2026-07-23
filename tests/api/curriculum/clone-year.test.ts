import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────
const { mockDbSelect, mockDbInsert, mockDbBatch, insertCalls } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbBatch: vi.fn(),
  insertCalls: [] as Array<{ table: string; values: unknown }>,
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/db", () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
    batch: mockDbBatch,
  },
}));
// Each table carries a string marker so the insert mock can identify which
// table is being written — critical for asserting NO materials insert happens.
vi.mock("@/db/schema", () => ({
  courses: { _t: "courses" },
  units: { _t: "units" },
  unitStandards: { _t: "unit_standards" },
  lessons: { _t: "lessons" },
  lessonStandards: { _t: "lesson_standards" },
  assessments: { _t: "assessments" },
  assessmentStandards: { _t: "assessment_standards" },
  materials: { _t: "materials" },
  materialAttachments: { _t: "material_attachments" },
  schoolYears: { _t: "school_years" },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  asc: vi.fn(),
  and: vi.fn(),
  inArray: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { GET, POST } from "../../../src/app/api/curriculum/clone-year/route";

const mockGetServerSession = vi.mocked(getServerSession);

// A promise-like Drizzle chain whose terminal methods resolve to `value`.
function makeChain(value: unknown) {
  const p = Promise.resolve(value);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  const self = () => chain;
  for (const m of ["from", "where", "orderBy", "limit", "onConflictDoNothing", "returning"]) {
    chain[m] = vi.fn(self);
  }
  chain.then = (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => p.then(r, j);
  chain.catch = (j: (e: unknown) => unknown) => p.catch(j);
  chain.finally = (fn: () => void) => p.finally(fn);
  return chain;
}

const OWNER = "teacher@school.edu";
const SESSION = { user: { email: OWNER, id: "google-sub-1" }, expires: "" };

const UID = {
  sourceCourse: "550e8400-e29b-41d4-a716-446655440001",
  unit1: "550e8400-e29b-41d4-a716-446655440010",
  lesson1: "550e8400-e29b-41d4-a716-446655440020",
  assess1: "550e8400-e29b-41d4-a716-446655440030",
  material1: "550e8400-e29b-41d4-a716-446655440040",
  targetYear: "550e8400-e29b-41d4-a716-446655440050",
};

function req(body: unknown) {
  return new Request("http://localhost/api/curriculum/clone-year", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  insertCalls.length = 0;
  // Capture every insert's table + values; return a chain (used both for the
  // schoolYears returning() and as batch builders).
  mockDbInsert.mockImplementation((table: { _t: string }) => {
    const chain = makeChain([{ id: UID.targetYear }]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (chain as any).values = vi.fn((values: unknown) => {
      insertCalls.push({ table: table._t, values });
      return chain;
    });
    return chain;
  });
  mockDbBatch.mockResolvedValue([]);
});

describe("POST /api/curriculum/clone-year", () => {
  it("401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await POST(
      req({ sourceCourseId: UID.sourceCourse, targetSchoolYear: "2026-2027" }),
    );
    expect(res.status).toBe(401);
  });

  it("400 on non-UUID sourceCourseId", async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    const res = await POST(req({ sourceCourseId: "not-a-uuid", targetSchoolYear: "2026-2027" }));
    expect(res.status).toBe(400);
  });

  it("400 on malformed target year (not YYYY-YYYY, second != first+1)", async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    const res = await POST(
      req({ sourceCourseId: UID.sourceCourse, targetSchoolYear: "2026-2028" }),
    );
    expect(res.status).toBe(400);
  });

  it("400 on an over-long custom title", async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    const res = await POST(
      req({
        sourceCourseId: UID.sourceCourse,
        targetSchoolYear: "2026-2027",
        title: "x".repeat(201),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("400 on malformed JSON body", async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    const bad = new Request("http://localhost/api/curriculum/clone-year", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    const res = await POST(bad);
    expect(res.status).toBe(400);
  });

  it("404 when the source course isn't owned by the caller", async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockDbSelect.mockReturnValueOnce(makeChain([])); // source course lookup → none
    const res = await POST(
      req({ sourceCourseId: UID.sourceCourse, targetSchoolYear: "2026-2027" }),
    );
    expect(res.status).toBe(404);
  });

  it("409 when a populated target course already exists for that grade+year", async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockDbSelect
      .mockReturnValueOnce(
        makeChain([{ id: UID.sourceCourse, grade: 8, subject: "ELA", schoolYearId: "sy-old" }]),
      ) // source course
      .mockReturnValueOnce(makeChain([{ id: UID.targetYear }])) // target year exists
      .mockReturnValueOnce(makeChain([{ id: "existing-course" }])) // target course exists
      .mockReturnValueOnce(makeChain([{ id: "existing-unit" }])); // ...and has a unit
    const res = await POST(
      req({ sourceCourseId: UID.sourceCourse, targetSchoolYear: "2026-2027" }),
    );
    expect(res.status).toBe(409);
  });

  it("clones the graph, reuses material rows (no Drive duplication), and never inserts materials", async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockDbSelect
      // 1. source course
      .mockReturnValueOnce(
        makeChain([
          {
            id: UID.sourceCourse,
            grade: 8,
            subject: "ELA",
            schoolYearId: "sy-old",
            title: "Grade 8 ELA",
            description: null,
            teacherNotes: null,
          },
        ]),
      )
      // 2. target school year lookup → not found (triggers insert)
      .mockReturnValueOnce(makeChain([]))
      // 3. target course lookup → none
      .mockReturnValueOnce(makeChain([]))
      // 4. source units
      .mockReturnValueOnce(
        makeChain([
          {
            id: UID.unit1,
            courseId: UID.sourceCourse,
            title: "Unit 1",
            sortOrder: 1,
            quarter: "Q1",
            durationWeeks: 3,
            summary: "s",
            essentialQuestions: null,
            anchorTexts: null,
            contentWarnings: null,
            teacherNotes: null,
            aiGenerationContext: null,
            source: "human",
          },
        ]),
      )
      // 5. unitStandards
      .mockReturnValueOnce(
        makeChain([{ unitId: UID.unit1, standardId: "8.RL.1", emphasis: "primary" }]),
      )
      // 6. lessons
      .mockReturnValueOnce(
        makeChain([
          {
            id: UID.lesson1,
            unitId: UID.unit1,
            title: "Lesson 1",
            sortOrder: 1,
            durationMinutes: 50,
            objectives: ["o1"],
            lessonPlan: {},
            teacherNotes: null,
            source: "ai",
            aiGenerationContext: null,
          },
        ]),
      )
      // 7. assessments
      .mockReturnValueOnce(
        makeChain([
          {
            id: UID.assess1,
            unitId: UID.unit1,
            title: "Quiz",
            assessmentType: "formative",
            sortOrder: 1,
            description: null,
            content: {},
            source: "ai",
            aiGenerationContext: null,
          },
        ]),
      )
      // 8. lessonStandards
      .mockReturnValueOnce(
        makeChain([{ lessonId: UID.lesson1, standardId: "8.RL.1", coverageType: "teaches" }]),
      )
      // 9. assessmentStandards
      .mockReturnValueOnce(makeChain([]))
      // 10. material attachments — one on the lesson, pointing at material1
      .mockReturnValueOnce(
        makeChain([
          {
            materialId: UID.material1,
            attachableType: "lesson",
            attachableId: UID.lesson1,
            role: "primary",
            sortOrder: 0,
          },
        ]),
      );

    const res = await POST(
      req({
        sourceCourseId: UID.sourceCourse,
        targetSchoolYear: "2026-2027",
        title: "Grade 8 ELA (2026-2027)",
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.unitCount).toBe(1);
    expect(data.lessonCount).toBe(1);
    expect(data.assessmentCount).toBe(1);
    expect(data.materialLinkCount).toBe(1);

    // Exactly one atomic batch.
    expect(mockDbBatch).toHaveBeenCalledOnce();

    // The materials table itself is NEVER inserted — Drive files are reused.
    expect(insertCalls.some((c) => c.table === "materials")).toBe(false);

    // The cloned attachment reuses the SAME materialId but points at a NEW
    // lesson id (not the source lesson id).
    const attachInsert = insertCalls.find((c) => c.table === "material_attachments");
    expect(attachInsert).toBeDefined();
    const attachRows = attachInsert!.values as Array<{ materialId: string; attachableId: string }>;
    expect(attachRows[0].materialId).toBe(UID.material1);
    expect(attachRows[0].attachableId).not.toBe(UID.lesson1);

    // The new course carries the source grade/subject and the CUSTOM title.
    const courseInsert = insertCalls.find((c) => c.table === "courses");
    expect(courseInsert).toBeDefined();
    expect((courseInsert!.values as { grade: number }).grade).toBe(8);
    expect((courseInsert!.values as { title: string }).title).toBe("Grade 8 ELA (2026-2027)");
  });
});

describe("GET /api/curriculum/clone-year", () => {
  it("401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("lists only courses with units and suggests the next year", async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockDbSelect
      // owner courses
      .mockReturnValueOnce(
        makeChain([
          { id: "c8", grade: 8, title: "Grade 8 ELA", schoolYearId: "sy1" },
          { id: "c7", grade: 7, title: "Grade 7 ELA", schoolYearId: "sy1" },
        ]),
      )
      // school year names
      .mockReturnValueOnce(makeChain([{ id: "sy1", name: "2025-2026" }]))
      // unit rows (only c8 has units)
      .mockReturnValueOnce(makeChain([{ id: "u1", courseId: "c8" }]));

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sources).toHaveLength(1);
    expect(data.sources[0].courseId).toBe("c8");
    expect(data.sources[0].schoolYear).toBe("2025-2026");
    expect(data.suggestedTargetYear).toBe("2026-2027");
  });
});
