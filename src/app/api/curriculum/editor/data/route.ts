// GET /api/curriculum/editor/data?courseId=xxx
// Returns all units, lessons, and assessments for a course in editor format.

import { db } from "@/db";
import { courses, units, lessons, assessments, materialAttachments, materials } from "@/db/schema";
import { eq, asc, inArray, sql, and } from "drizzle-orm";

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

  // Load material details per lesson/assessment
  const lessonIds = allLessons.map((l) => l.id);
  const assessmentIds = allAssessments.map((a) => a.id);

  type MatLink = {
    attachmentId: string;
    materialId: string;
    title: string;
    materialType: string;
    role: string;
    driveWebUrl: string | null;
    attachableId: string;
  };

  const lessonMats: MatLink[] = lessonIds.length
    ? await db
        .select({
          attachmentId: materialAttachments.id,
          materialId: materials.id,
          title: materials.title,
          materialType: materials.materialType,
          role: materialAttachments.role,
          driveWebUrl: materials.driveWebUrl,
          attachableId: materialAttachments.attachableId,
        })
        .from(materialAttachments)
        .innerJoin(materials, eq(materials.id, materialAttachments.materialId))
        .where(
          and(
            eq(materialAttachments.attachableType, "lesson"),
            inArray(materialAttachments.attachableId, lessonIds)
          )
        )
        .orderBy(asc(materialAttachments.sortOrder))
    : [];

  const assessmentMats: MatLink[] = assessmentIds.length
    ? await db
        .select({
          attachmentId: materialAttachments.id,
          materialId: materials.id,
          title: materials.title,
          materialType: materials.materialType,
          role: materialAttachments.role,
          driveWebUrl: materials.driveWebUrl,
          attachableId: materialAttachments.attachableId,
        })
        .from(materialAttachments)
        .innerJoin(materials, eq(materials.id, materialAttachments.materialId))
        .where(
          and(
            eq(materialAttachments.attachableType, "assessment"),
            inArray(materialAttachments.attachableId, assessmentIds)
          )
        )
        .orderBy(asc(materialAttachments.sortOrder))
    : [];

  // Group by attachable ID
  const lessonMatMap = new Map<string, MatLink[]>();
  for (const m of lessonMats) {
    const arr = lessonMatMap.get(m.attachableId) ?? [];
    arr.push(m);
    lessonMatMap.set(m.attachableId, arr);
  }

  const assessmentMatMap = new Map<string, MatLink[]>();
  for (const m of assessmentMats) {
    const arr = assessmentMatMap.get(m.attachableId) ?? [];
    arr.push(m);
    assessmentMatMap.set(m.attachableId, arr);
  }

  const result = courseUnits.map((unit) => ({
    id: unit.id,
    title: unit.title,
    quarter: unit.quarter,
    sortOrder: unit.sortOrder,
    durationWeeks: unit.durationWeeks,
    summary: unit.summary,
    lessons: allLessons
      .filter((l) => l.unitId === unit.id)
      .map((l) => {
        const mats = lessonMatMap.get(l.id) ?? [];
        return {
          id: l.id,
          title: l.title,
          sortOrder: l.sortOrder,
          durationMinutes: l.durationMinutes,
          source: l.source,
          materialCount: mats.length,
          materials: mats.map((m) => ({
            attachmentId: m.attachmentId,
            materialId: m.materialId,
            title: m.title,
            materialType: m.materialType,
            role: m.role,
            driveWebUrl: m.driveWebUrl,
          })),
        };
      }),
    assessments: allAssessments
      .filter((a) => a.unitId === unit.id)
      .map((a) => {
        const mats = assessmentMatMap.get(a.id) ?? [];
        return {
          id: a.id,
          title: a.title,
          assessmentType: a.assessmentType,
          sortOrder: a.sortOrder,
          source: a.source,
          materialCount: mats.length,
          materials: mats.map((m) => ({
            attachmentId: m.attachmentId,
            materialId: m.materialId,
            title: m.title,
            materialType: m.materialType,
            role: m.role,
            driveWebUrl: m.driveWebUrl,
          })),
        };
      }),
  }));

  return Response.json({
    course: { id: course.id, title: course.title, grade: course.grade },
    units: result,
  });
}
