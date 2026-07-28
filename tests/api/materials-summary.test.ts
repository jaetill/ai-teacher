import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDbSelect } = vi.hoisted(() => ({ mockDbSelect: vi.fn() }));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/db", () => ({ db: { select: mockDbSelect } }));
vi.mock("@/db/schema", () => ({
  materials: { title: {}, materialType: {}, driveFolderId: {}, createdAt: {} },
  driveFolders: { folderKey: {}, driveId: {}, ownerEmail: {} },
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  isNull: vi.fn(),
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
  for (const m of ["from", "innerJoin", "where", "orderBy"]) c[m] = vi.fn(self);
  c.then = (r: (v: unknown) => unknown) => p.then(r);
  return c;
}

beforeEach(() => vi.clearAllMocks());

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
});
