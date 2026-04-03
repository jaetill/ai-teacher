// GET /api/curriculum/editor/data?courseId=xxx
// Returns all units, lessons, and assessments for a course in editor format.

import { db } from "@/db";
import { courses, units, lessons, assessments, materialAttachments } from "@/db/schema";
import { eq, asc, inArray, sql } from "drizzle-orm";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get("courseId");

  if (!courseId) {
    return Response.json({ error: "courseId required" }, { status: 400 });
  }

  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);

  if (!course) {
    return Response.json({ error: "Course not found" }, { status: 404 });
  }

  const courseUnits = await db
    .select()
    .from(units)
    .where(eq(units.courseId, courseId))
    .orderBy(asc(units.sortOrder));

  const unitIds = courseUnits.map((u) => u.id);

  const allLessons = unitIds.length
    ? await db
        .select()
        .from(lessons)
        .where(inArray(lessons.unitId, unitIds))
        .orderBy(asc(lessons.sortOrder))
    : [];

  const allAssessments = unitIds.length
    ? await db
        .select()
        .from(assessments)
        .where(inArray(assessments.unitId, unitIds))
        .orderBy(asc(assessments.sortOrder))
    : [];

  // Count materials per lesson/assessment
  const lessonIds = allLessons.map((l) => l.id);
  const assessmentIds = allAssessments.map((a) => a.id);

  const lessonMatCounts = lessonIds.length
    ? await db
        .select({
          attachableId: materialAttachments.attachableId,
          count: sql<number>`count(*)::int`,
        })
        .from(materialAttachments)
        .where(
          sql`${materialAttachments.attachableType} = 'lesson' AND ${materialAttachments.attachableId} IN ${lessonIds}`
        )
        .groupBy(materialAttachments.attachableId)
    : [];

  const assessmentMatCounts = assessmentIds.length
    ? await db
        .select({
          attachableId: materialAttachments.attachableId,
          count: sql<number>`count(*)::int`,
        })
        .from(materialAttachments)
        .where(
          sql`${materialAttachments.attachableType} = 'assessment' AND ${materialAttachments.attachableId} IN ${assessmentIds}`
        )
        .groupBy(materialAttachments.attachableId)
    : [];

  const lessonMatMap = new Map(lessonMatCounts.map((r) => [r.attachableId, r.count]));
  const assessmentMatMap = new Map(assessmentMatCounts.map((r) => [r.attachableId, r.count]));

  const result = courseUnits.map((unit) => ({
    id: unit.id,
    title: unit.title,
    quarter: unit.quarter,
    sortOrder: unit.sortOrder,
    durationWeeks: unit.durationWeeks,
    summary: unit.summary,
    lessons: allLessons
      .filter((l) => l.unitId === unit.id)
      .map((l) => ({
        id: l.id,
        title: l.title,
        sortOrder: l.sortOrder,
        durationMinutes: l.durationMinutes,
        source: l.source,
        materialCount: lessonMatMap.get(l.id) ?? 0,
      })),
    assessments: allAssessments
      .filter((a) => a.unitId === unit.id)
      .map((a) => ({
        id: a.id,
        title: a.title,
        assessmentType: a.assessmentType,
        sortOrder: a.sortOrder,
        source: a.source,
        materialCount: assessmentMatMap.get(a.id) ?? 0,
      })),
  }));

  return Response.json({
    course: { id: course.id, title: course.title, grade: course.grade },
    units: result,
  });
}
