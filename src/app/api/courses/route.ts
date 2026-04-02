// GET /api/courses
// Returns all courses with their units, ordered by grade and sort order.

import { db } from "@/db";
import { courses, units, schoolYears } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

export async function GET() {
  // Get current school year
  const [currentYear] = await db
    .select()
    .from(schoolYears)
    .where(eq(schoolYears.isCurrent, true))
    .limit(1);

  const allCourses = await db
    .select()
    .from(courses)
    .orderBy(asc(courses.grade));

  const allUnits = await db
    .select({
      id: units.id,
      courseId: units.courseId,
      title: units.title,
      sortOrder: units.sortOrder,
      quarter: units.quarter,
      durationWeeks: units.durationWeeks,
      summary: units.summary,
      contentWarnings: units.contentWarnings,
      source: units.source,
    })
    .from(units)
    .orderBy(asc(units.sortOrder));

  const result = allCourses.map((course) => ({
    ...course,
    units: allUnits.filter((u) => u.courseId === course.id),
  }));

  return Response.json({
    schoolYear: currentYear?.name ?? null,
    courses: result,
  });
}
