// GET /api/units/[id]
// Returns a single unit with its lessons and linked standards.

import { db } from "@/db";
import { units, lessons, unitStandards, standards, courses } from "@/db/schema";
import { eq, asc } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [unit] = await db.select().from(units).where(eq(units.id, id)).limit(1);

  if (!unit) {
    return Response.json({ error: "Unit not found" }, { status: 404 });
  }

  const [course] = await db
    .select({ grade: courses.grade, title: courses.title })
    .from(courses)
    .where(eq(courses.id, unit.courseId))
    .limit(1);

  const unitLessons = await db
    .select({
      id: lessons.id,
      title: lessons.title,
      sortOrder: lessons.sortOrder,
      durationMinutes: lessons.durationMinutes,
      objectives: lessons.objectives,
      lessonPlan: lessons.lessonPlan,
      teacherNotes: lessons.teacherNotes,
      source: lessons.source,
    })
    .from(lessons)
    .where(eq(lessons.unitId, id))
    .orderBy(asc(lessons.sortOrder));

  const linkedStandards = await db
    .select({
      id: standards.id,
      description: standards.description,
      strandCode: standards.strandCode,
      strandName: standards.strandName,
      emphasis: unitStandards.emphasis,
    })
    .from(unitStandards)
    .innerJoin(standards, eq(unitStandards.standardId, standards.id))
    .where(eq(unitStandards.unitId, id));

  return Response.json({
    unit: {
      ...unit,
      grade: course?.grade,
      courseTitle: course?.title,
      lessons: unitLessons,
      standards: linkedStandards,
    },
  });
}
