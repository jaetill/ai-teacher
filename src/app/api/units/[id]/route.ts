// GET /api/units/[id]
// Returns a single unit with its lessons and linked standards.

import { db } from "@/db";
import {
  units,
  lessons,
  unitStandards,
  lessonStandards,
  standards,
  courses,
  driveFolders,
} from "@/db/schema";
import { eq, asc, inArray } from "drizzle-orm";

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

  // ── Lesson-level standards ───
  const lessonIds = unitLessons.map((l) => l.id);
  const lessonStandardRows = lessonIds.length
    ? await db
        .select({
          lessonId: lessonStandards.lessonId,
          standardId: lessonStandards.standardId,
          coverageType: lessonStandards.coverageType,
        })
        .from(lessonStandards)
        .where(inArray(lessonStandards.lessonId, lessonIds))
    : [];

  // Group by lesson
  const stdsByLesson = new Map<string, Array<{ id: string; coverageType: string }>>();
  for (const row of lessonStandardRows) {
    if (!stdsByLesson.has(row.lessonId)) {
      stdsByLesson.set(row.lessonId, []);
    }
    stdsByLesson.get(row.lessonId)!.push({
      id: row.standardId,
      coverageType: row.coverageType,
    });
  }

  const lessonsWithStandards = unitLessons.map((l) => ({
    ...l,
    standards: stdsByLesson.get(l.id) ?? [],
  }));

  // ── Drive folder link ───
  const quarter = `Q${Math.ceil(unit.sortOrder / 2)}`;
  const folderKey = `grade_${course?.grade}_${quarter}`;
  const [driveFolder] = await db
    .select({ driveId: driveFolders.driveId })
    .from(driveFolders)
    .where(eq(driveFolders.folderKey, folderKey))
    .limit(1);

  return Response.json({
    unit: {
      ...unit,
      grade: course?.grade,
      courseTitle: course?.title,
      lessons: lessonsWithStandards,
      standards: linkedStandards,
      driveUrl: driveFolder
        ? `https://drive.google.com/drive/folders/${driveFolder.driveId}`
        : null,
    },
  });
}
