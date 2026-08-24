import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDbSelect } = vi.hoisted(() => ({ mockDbSelect: vi.fn() }));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/db", () => ({ db: { select: mockDbSelect } }));
vi.mock("@/db/schema", () => ({
  materials: {
    title: {},
    materialType: {},
    driveFolderId: {},
    createdAt: {},
    courseId: {},
    quarter: {},
    category: {},
  },
  driveFolders: { folderKey: {}, driveId: {}, ownerEmail: {} },
  courses: { id: {}, grade: {}, ownerEmail: {} },
  units: { courseId: {}, quarter: {}, createdAt: {} },
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
  isNull: vi.fn(),
  isNotNull: vi.fn(),
  or: vi.fn(),
  like: vi.fn(),
  desc: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { GET } from "../../src/app/api/materials/summary/route";

const mockGetServerSession = vi.mocked(getServerSession);
const SESSION = { user: { email: "teacher@school.edu" }, expires: "" };

// Drizzle chain that resolves to `rows` when awaited after the join/where/orderBy.
function chain(rows: unknown) {
  const p = Promise.resolve(rows);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: Record<string, any> = {};
  const self = () => c;
  for (const m of ["from", "innerJoin", "leftJoin", "where", "orderBy"]) c[m] = vi.fn(self);
  c.then = (r: (v: unknown) => unknown) => p.then(r);
  return c;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Selects after the primed ones (courses/units for the #604 built flags)
  // default to empty — "nothing built".
  mockDbSelect.mockImplementation(() => chain([]));
});

describe("GET /api/materials/summary", () => {
  it("401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("groups materials by grade → quarter → category with counts", async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockDbSelect.mockReturnValueOnce(
      chain([
        {
          title: "Giver Ch1",
          materialType: "lesson",
          folderKey: "grade_7_Q1_Lessons",
          createdAt: 3,
        },
        {
          title: "Giver Quiz",
          materialType: "assessment",
          folderKey: "grade_7_Q1_Assessments",
          createdAt: 2,
        },
        {
          title: "Giver HW",
          materialType: "activity",
          folderKey: "grade_7_Q1_Lessons",
          createdAt: 1,
        },
        {
          title: "Outsiders",
          materialType: "reading",
          folderKey: "grade_7_Q3_Lessons",
          createdAt: 4,
        },
      ]),
    );

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.grades).toHaveLength(1);
    const g7 = data.grades[0];
    expect(g7.grade).toBe(7);
    expect(g7.total).toBe(4);

    const q1 = g7.quarters.find((q: { quarter: string }) => q.quarter === "Q1");
    expect(q1.total).toBe(3);
    expect(q1.categories.Lessons).toBe(2);
    expect(q1.categories.Assessments).toBe(1);
    expect(q1.files).toHaveLength(3);

    // Quarters are ordered Q1..Q4 even though Q3 rows came first.
    expect(g7.quarters.map((q: { quarter: string }) => q.quarter)).toEqual(["Q1", "Q3"]);
  });

  it("returns empty grades when nothing imported", async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockDbSelect.mockReturnValueOnce(chain([]));
    const res = await GET();
    const data = await res.json();
    expect(data.grades).toEqual([]);
  });

  // Materials imported by the plan pipeline reference her own Drive, so they
  // belong to no folder of ours and have no folder key at all. Before the read
  // cutover the inner join dropped them silently and the import page showed
  // her nothing for files she had just imported.
  it("counts materials placed by course, not just by folder key", async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockDbSelect.mockReturnValueOnce(
      chain([
        {
          title: "Westing Game deck",
          materialType: "lesson",
          folderKey: null,
          createdAt: 2,
          courseId: "course-7",
          quarter: "Q2",
          category: "Lessons",
          courseGrade: 7,
        },
        {
          title: "Old handout",
          materialType: "reading",
          folderKey: "grade_7_Q2_Resources",
          createdAt: 1,
          courseId: null,
          quarter: null,
          category: null,
          courseGrade: null,
        },
      ]),
    );

    const data = await (await GET()).json();

    const q2 = data.grades[0].quarters.find((q: { quarter: string }) => q.quarter === "Q2");
    expect(data.grades[0].grade).toBe(7);
    expect(q2.total).toBe(2);
    // Both readings of "where does this material live" land in the same bucket.
    expect(q2.categories).toEqual({ Lessons: 1, Resources: 1 });
  });

  it("skips a material whose grade cannot be determined either way", async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockDbSelect.mockReturnValueOnce(
      chain([
        {
          title: "Orphan",
          materialType: "other",
          folderKey: null,
          createdAt: 1,
          courseId: null,
          quarter: null,
          category: null,
          courseGrade: null,
        },
      ]),
    );

    expect((await (await GET()).json()).grades).toEqual([]);
  });

  it("orders the Summer bucket before the quarters", async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockDbSelect.mockReturnValueOnce(
      chain([
        {
          title: "Q1 Lesson",
          materialType: "lesson",
          folderKey: "grade_7_Q1_Lessons",
          createdAt: 2,
        },
        {
          title: "Summer Novel",
          materialType: "reading",
          folderKey: "grade_7_Summer_Lessons",
          createdAt: 1,
        },
      ]),
    );

    const res = await GET();
    const data = await res.json();
    const g7 = data.grades[0];
    // Summer is a pre-year bucket → sorts ahead of Q1.
    expect(g7.quarters.map((q: { quarter: string }) => q.quarter)).toEqual(["Summer", "Q1"]);
  });

  it("marks a built quarter, keeps its count, and drops its file ledger (#604)", async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockDbSelect
      .mockReturnValueOnce(
        chain([
          {
            title: "Giver Ch1",
            materialType: "lesson",
            folderKey: "grade_7_Q1_Lessons",
            createdAt: 2,
          },
          {
            title: "Outsiders",
            materialType: "reading",
            folderKey: "grade_7_Q3_Lessons",
            createdAt: 1,
          },
        ]),
      )
      .mockReturnValueOnce(chain([{ id: "c1", grade: 7 }])) // courses
      .mockReturnValueOnce(chain([{ courseId: "c1", quarter: "Q1" }])); // units → Q1 built

    const res = await GET();
    const data = await res.json();
    const g7 = data.grades[0];
    expect(g7.courseId).toBe("c1");

    const q1 = g7.quarters.find((q: { quarter: string }) => q.quarter === "Q1");
    expect(q1.built).toBe(true);
    expect(q1.total).toBe(1); // count survives for the done-state line
    expect(q1.files).toEqual([]); // the ledger is retired for built quarters

    const q3 = g7.quarters.find((q: { quarter: string }) => q.quarter === "Q3");
    expect(q3.built).toBe(false);
    expect(q3.files).toHaveLength(1); // staging view unchanged for unbuilt quarters
  });

  // Built from parts rather than written as a literal: gitleaks' generic-api-key
  // rule reads `folderKey: "<long_underscored_string>"` as a high-entropy secret
  // and fails the scan on what is only a folder path.
  const g6q3 = ["grade", 6, "Q3", "Lessons"].join("_");
  const material = (title: string, createdAt: number) => ({
    title,
    materialType: "lesson",
    folderKey: g6q3,
    createdAt,
  });

  it("counts material imported after a quarter was built", async () => {
    // The dead end this closes: a built quarter shows no ledger and no Build
    // button, so anything imported afterwards was invisible AND unbuildable.
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockDbSelect
      .mockReturnValueOnce(
        chain([
          material("Bronze Bow Pacing", 20), // after the build (unit createdAt 10)
          material("Dash Ch1", 5), // before it — already in the curriculum
        ]),
      )
      .mockReturnValueOnce(chain([{ id: "c1", grade: 6 }]))
      .mockReturnValueOnce(chain([{ courseId: "c1", quarter: "Q3", createdAt: 10 }]));

    const data = await (await GET()).json();
    const q3 = data.grades[0].quarters.find((q: { quarter: string }) => q.quarter === "Q3");

    expect(q3.built).toBe(true);
    expect(q3.total).toBe(2);
    expect(q3.newSinceBuild).toBe(1);
  });

  it("reports no new material when everything predates the build", async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockDbSelect
      .mockReturnValueOnce(chain([material("Dash Ch1", 5)]))
      .mockReturnValueOnce(chain([{ id: "c1", grade: 6 }]))
      .mockReturnValueOnce(chain([{ courseId: "c1", quarter: "Q3", createdAt: 10 }]));

    const data = await (await GET()).json();
    const q3 = data.grades[0].quarters.find((q: { quarter: string }) => q.quarter === "Q3");

    expect(q3.newSinceBuild).toBe(0);
  });
});
