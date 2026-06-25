import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next-auth before importing the route.
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

// Mock the DB so the test never hits a real database.
vi.mock("@/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/db/schema", () => ({
  schoolYears: { isCurrent: "isCurrent" },
  courses: {},
  units: {},
}));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), asc: vi.fn() }));

import { getServerSession } from "next-auth";
import { db } from "@/db";
import { GET } from "../../src/app/api/courses/route";

const mockGetServerSession = vi.mocked(getServerSession);
const mockSelect = vi.mocked(db.select);

describe("GET /api/courses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no session", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await GET();

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Not authenticated");
  });

  it("returns 200 with schoolYear and courses when authenticated", async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { name: "Test Teacher" } });

    // First select: schoolYears — select().from().where().limit()
    const schoolYearChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ name: "2025-2026" }]),
    };

    // Second select: courses — select().from().orderBy()
    const coursesChain = {
      from: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue([{ id: "c1", grade: 7 }]),
    };

    // Third select: units — select({...}).from().orderBy()
    const unitsChain = {
      from: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue([
        {
          id: "u1",
          courseId: "c1",
          title: "Unit 1",
          sortOrder: 1,
          quarter: 1,
          durationWeeks: 4,
          summary: null,
          contentWarnings: null,
          source: null,
        },
      ]),
    };

    mockSelect
      .mockReturnValueOnce(schoolYearChain as unknown as ReturnType<typeof db.select>)
      .mockReturnValueOnce(coursesChain as unknown as ReturnType<typeof db.select>)
      .mockReturnValueOnce(unitsChain as unknown as ReturnType<typeof db.select>);

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.schoolYear).toBe("2025-2026");
    expect(body.courses).toHaveLength(1);
    expect(body.courses[0].id).toBe("c1");
    expect(body.courses[0].units).toHaveLength(1);
    expect(body.courses[0].units[0].courseId).toBe("c1");
  });
});
