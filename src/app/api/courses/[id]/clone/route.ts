// POST /api/courses/[id]/clone — fork a course into the CURRENT school year.
//
// The product thesis in code: "a new school year is a fork + swaps of last
// year's curriculum, not a rebuild." This clones the whole tree — course,
// units, lessons, unit/lesson standards — and RE-ATTACHES the same materials
// (attachments are re-bindable slots, #601: the clone points at the same
// Drive files; nothing in Drive is copied or touched).
//
// Safety posture (Jason's gate: "only if I can easily delete it"): the clone
// is ordinary new rows under a new course id — the existing course DELETE
// (cascade + polymorphic-attachment cleanup) removes it completely, and the
// source course is never modified. Refuses with 409 if the grade already has
// a course in the current year, so a double-click can't fork twice.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import {
  courses,
  units,
  lessons,
  unitStandards,
  lessonStandards,
  materialAttachments,
  schoolYears,
} from "@/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { isUuid } from "@/lib/api-utils";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  const ownerEmail = session?.user?.email;
  if (!ownerEmail) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  if (!isUuid(id)) {
    return Response.json({ error: "Invalid course id" }, { status: 400 });
  }

  const [source] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.id, id), eq(courses.ownerEmail, ownerEmail)))
    .limit(1);
  if (!source) {
    return Response.json({ error: "Course not found" }, { status: 404 });
  }

  const [currentYear] = await db
    .select({ id: schoolYears.id, name: schoolYears.name })
    .from(schoolYears)
    .where(eq(schoolYears.isCurrent, true))
    .limit(1);
  if (!currentYear) {
    return Response.json({ error: "No current school year is set" }, { status: 400 });
  }
  if (source.schoolYearId === currentYear.id) {
    return Response.json(
      { error: "This course is already in the current school year" },
      { status: 400 },
    );
  }

  // One planning course per grade+year+owner (mirrors the unique constraint;
  // checked first for a clean 409 instead of a DB error).
  const [existing] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(
      and(
        eq(courses.grade, source.grade),
        eq(courses.subject, source.subject),
        eq(courses.schoolYearId, currentYear.id),
        eq(courses.ownerEmail, ownerEmail),
      ),
    )
    .limit(1);
  if (existing) {
    return Response.json(
      { error: `Grade ${source.grade} already has a ${currentYear.name} course` },
      { status: 409 },
    );
  }

  // ── Course ───
  const [newCourse] = await db
    .insert(courses)
    .values({
      title: source.title,
      grade: source.grade,
      subject: source.subject,
      schoolYearId: currentYear.id,
      ownerEmail,
      teacherNotes: source.teacherNotes,
      meetingDays: source.meetingDays,
    })
    .returning({ id: courses.id });

  // ── Units (batched; map old id → new by unique sortOrder) ───
  const srcUnits = await db
    .select()
    .from(units)
    .where(eq(units.courseId, id))
    .orderBy(asc(units.sortOrder));

  const unitIdMap = new Map<string, string>();
  if (srcUnits.length > 0) {
    const inserted = await db
      .insert(units)
      .values(
        srcUnits.map((u) => ({
          courseId: newCourse.id,
          title: u.title,
          sortOrder: u.sortOrder,
          quarter: u.quarter,
          durationWeeks: u.durationWeeks,
          summary: u.summary,
          essentialQuestions: u.essentialQuestions,
          anchorTexts: u.anchorTexts,
          contentWarnings: u.contentWarnings,
          teacherNotes: u.teacherNotes,
          userId: session.user?.id ?? u.userId,
          source: u.source,
        })),
      )
      .returning({ id: units.id, sortOrder: units.sortOrder });
    const bySort = new Map(inserted.map((u) => [u.sortOrder, u.id]));
    for (const u of srcUnits) unitIdMap.set(u.id, bySort.get(u.sortOrder)!);
  }
  const srcUnitIds = srcUnits.map((u) => u.id);

  // ── Lessons (batched; map by (unit, sortOrder)) ───
  const srcLessons = srcUnitIds.length
    ? await db.select().from(lessons).where(inArray(lessons.unitId, srcUnitIds))
    : [];
  const lessonIdMap = new Map<string, string>();
  if (srcLessons.length > 0) {
    const inserted = await db
      .insert(lessons)
      .values(
        srcLessons.map((l) => ({
          unitId: unitIdMap.get(l.unitId)!,
          title: l.title,
          sortOrder: l.sortOrder,
          durationMinutes: l.durationMinutes,
          objectives: l.objectives,
          lessonPlan: l.lessonPlan,
          teacherNotes: l.teacherNotes,
          source: l.source,
        })),
      )
      .returning({ id: lessons.id, unitId: lessons.unitId, sortOrder: lessons.sortOrder });
    const byKey = new Map(inserted.map((l) => [`${l.unitId}:${l.sortOrder}`, l.id]));
    for (const l of srcLessons) {
      const key = `${unitIdMap.get(l.unitId)}:${l.sortOrder}`;
      const newId = byKey.get(key);
      if (newId) lessonIdMap.set(l.id, newId);
    }
  }
  const srcLessonIds = srcLessons.map((l) => l.id);

  // ── Standards links ───
  const srcUnitStds = srcUnitIds.length
    ? await db.select().from(unitStandards).where(inArray(unitStandards.unitId, srcUnitIds))
    : [];
  if (srcUnitStds.length > 0) {
    await db
      .insert(unitStandards)
      .values(
        srcUnitStds.map((s) => ({
          unitId: unitIdMap.get(s.unitId)!,
          standardId: s.standardId,
          emphasis: s.emphasis,
        })),
      )
      .onConflictDoNothing();
  }
  const srcLessonStds = srcLessonIds.length
    ? await db.select().from(lessonStandards).where(inArray(lessonStandards.lessonId, srcLessonIds))
    : [];
  const lessonStdRows = srcLessonStds
    .filter((s) => lessonIdMap.has(s.lessonId))
    .map((s) => ({
      lessonId: lessonIdMap.get(s.lessonId)!,
      standardId: s.standardId,
      coverageType: s.coverageType,
    }));
  if (lessonStdRows.length > 0) {
    await db.insert(lessonStandards).values(lessonStdRows).onConflictDoNothing();
  }

  // ── Material attachments: same materials, new attachables (re-bindable slots) ───
  const attachableIds = [...srcUnitIds, ...srcLessonIds];
  const srcAttachments = attachableIds.length
    ? await db
        .select()
        .from(materialAttachments)
        .where(inArray(materialAttachments.attachableId, attachableIds))
    : [];
  const attachmentRows = srcAttachments
    .map((a) => {
      const newId =
        a.attachableType === "unit"
          ? unitIdMap.get(a.attachableId)
          : a.attachableType === "lesson"
            ? lessonIdMap.get(a.attachableId)
            : undefined;
      if (!newId) return null;
      return {
        materialId: a.materialId,
        attachableType: a.attachableType,
        attachableId: newId,
        role: a.role,
        sortOrder: a.sortOrder,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  if (attachmentRows.length > 0) {
    await db.insert(materialAttachments).values(attachmentRows).onConflictDoNothing();
  }

  return Response.json({
    courseId: newCourse.id,
    schoolYear: currentYear.name,
    unitCount: srcUnits.length,
    lessonCount: srcLessons.length,
    attachmentCount: attachmentRows.length,
  });
}
