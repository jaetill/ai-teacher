// GET /api/courses
// Returns all courses with their units, ordered by grade and sort order.

import { db } from "@/db";
import { courses, units } from "@/db/schema";
import { asc } from "drizzle-orm";

export async function GET() {
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

  return Response.json({ courses: result });
}
