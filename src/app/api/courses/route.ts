// GET /api/courses
// Returns the authenticated owner's courses with their units, ordered by grade
// and sort order. Scoped to session.user.email — cross-user data never reaches
// the wire even at the DB layer.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { courses, units, schoolYears } from "@/db/schema";
import { asc, eq, inArray } from "drizzle-orm";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const ownerEmail = session.user?.email;
  if (!ownerEmail) {
    return Response.json({ error: "Session missing email" }, { status: 401 });
  }

  const [currentYear] = await db
    .select()
    .from(schoolYears)
    .where(eq(schoolYears.isCurrent, true))
    .limit(1);

  const allCourses = await db
    .select()
    .from(courses)
    .where(eq(courses.ownerEmail, ownerEmail))
    .orderBy(asc(courses.grade));

  const courseIds = allCourses.map((c) => c.id);

  const allUnits =
    courseIds.length > 0
      ? await db
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
          .where(inArray(units.courseId, courseIds))
          .orderBy(asc(units.sortOrder))
      : [];

  const result = allCourses.map((course) => ({
    ...course,
    units: allUnits.filter((u) => u.courseId === course.id),
  }));

  return Response.json({
    schoolYear: currentYear?.name ?? null,
    courses: result,
  });
}
