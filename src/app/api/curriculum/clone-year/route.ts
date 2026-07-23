// GET  /api/curriculum/clone-year
//   Lists the owner's courses that can serve as a clone source (any course
//   with at least one unit), plus a suggested target school year. Used to
//   populate the "Import from previous year" picker.
//
// POST /api/curriculum/clone-year
//   Body: { sourceCourseId: uuid, targetSchoolYear: "YYYY-YYYY" }
//   Deep-copies a course's curriculum (units, unit standards, lessons, lesson
//   standards, assessments, assessment standards, and material *attachments*)
//   into a new course for the target school year. Material rows themselves are
//   NOT duplicated — the cloned attachments reference the same material records
//   (and therefore the same Google Drive files), so no Drive files are copied.
//
//   Calendar/actuals (scheduled_units, lesson_schedules) are intentionally not
//   cloned — planned/taught dates belong to the year they happened in.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import {
  courses,
  units,
  unitStandards,
  lessons,
  lessonStandards,
  assessments,
  assessmentStandards,
  materialAttachments,
  schoolYears,
} from "@/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { readJson, isUuid } from "@/lib/api-utils";

const YEAR_RE = /^(\d{4})-(\d{4})$/;

/** Validate a "YYYY-YYYY" school-year name where the second year is first + 1. */
function parseYearName(name: unknown): { y1: number; y2: number } | null {
  if (typeof name !== "string") return null;
  const m = name.match(YEAR_RE);
  if (!m) return null;
  const y1 = parseInt(m[1], 10);
  const y2 = parseInt(m[2], 10);
  if (y2 !== y1 + 1) return null;
  return { y1, y2 };
}

// ── GET: list clonable source courses ───────────────────────────────────────

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const ownerEmail = session.user?.email;
  if (!ownerEmail) {
    return Response.json({ error: "Session missing email" }, { status: 401 });
  }

  const ownerCourses = await db
    .select({
      id: courses.id,
      grade: courses.grade,
      title: courses.title,
      schoolYearId: courses.schoolYearId,
    })
    .from(courses)
    .where(eq(courses.ownerEmail, ownerEmail))
    .orderBy(asc(courses.grade));

  if (ownerCourses.length === 0) {
    return Response.json({ sources: [], suggestedTargetYear: null });
  }

  // Resolve year names for the courses that have one.
  const yearIds = [
    ...new Set(ownerCourses.map((c) => c.schoolYearId).filter((id): id is string => !!id)),
  ];
  const years =
    yearIds.length > 0
      ? await db
          .select({ id: schoolYears.id, name: schoolYears.name })
          .from(schoolYears)
          .where(inArray(schoolYears.id, yearIds))
      : [];
  const yearNameById = new Map(years.map((y) => [y.id, y.name]));

  // Unit counts per course (only courses with ≥1 unit are clonable).
  const courseIds = ownerCourses.map((c) => c.id);
  const unitRows = await db
    .select({ id: units.id, courseId: units.courseId })
    .from(units)
    .where(inArray(units.courseId, courseIds));
  const unitCountByCourse = new Map<string, number>();
  for (const u of unitRows) {
    unitCountByCourse.set(u.courseId, (unitCountByCourse.get(u.courseId) ?? 0) + 1);
  }

  const sources = ownerCourses
    .map((c) => ({
      courseId: c.id,
      grade: c.grade,
      title: c.title,
      schoolYear: c.schoolYearId ? yearNameById.get(c.schoolYearId) ?? null : null,
      unitCount: unitCountByCourse.get(c.id) ?? 0,
    }))
    .filter((s) => s.unitCount > 0);

  // Suggest "next year" relative to the latest source year we can parse.
  let suggestedTargetYear: string | null = null;
  let latestStart = -Infinity;
  for (const s of sources) {
    const parsed = parseYearName(s.schoolYear);
    if (parsed && parsed.y1 > latestStart) {
      latestStart = parsed.y1;
      suggestedTargetYear = `${parsed.y1 + 1}-${parsed.y2 + 1}`;
    }
  }

  return Response.json({ sources, suggestedTargetYear });
}

// ── POST: perform the clone ──────────────────────────────────────────────────

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const ownerEmail = session.user?.email;
  if (!ownerEmail) {
    return Response.json({ error: "Session missing email" }, { status: 401 });
  }

  const body = await readJson<{
    sourceCourseId: string;
    targetSchoolYear: string;
    title?: string;
  }>(req);
  if (!body) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { sourceCourseId, targetSchoolYear } = body;

  if (!isUuid(sourceCourseId)) {
    return Response.json({ error: "Invalid sourceCourseId" }, { status: 400 });
  }
  const targetYear = parseYearName(targetSchoolYear);
  if (!targetYear) {
    return Response.json(
      { error: "targetSchoolYear must be a school year like \"2026-2027\"" },
      { status: 400 },
    );
  }

  // Optional custom title for the new course. Falls back to the source title.
  let title: string | undefined;
  if (body.title !== undefined) {
    if (typeof body.title !== "string" || body.title.trim().length === 0 || body.title.length > 200) {
      return Response.json(
        { error: "title must be a non-empty string of at most 200 characters" },
        { status: 400 },
      );
    }
    title = body.title.trim();
  }

  // ── Load + authorize source course ───
  const [sourceCourse] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.id, sourceCourseId), eq(courses.ownerEmail, ownerEmail)))
    .limit(1);
  if (!sourceCourse) {
    // 404 (not 403) so we don't reveal existence of other owners' course ids.
    return Response.json({ error: "Source course not found" }, { status: 404 });
  }

  // ── Resolve or create the target school year ───
  let [targetYearRow] = await db
    .select({ id: schoolYears.id })
    .from(schoolYears)
    .where(eq(schoolYears.name, targetSchoolYear))
    .limit(1);

  if (!targetYearRow) {
    // Sensible default dates derived from the name; isCurrent stays false so we
    // don't silently flip the app's "current year". The teacher can adjust
    // dates and promote it to current later.
    [targetYearRow] = await db
      .insert(schoolYears)
      .values({
        name: targetSchoolYear,
        startDate: `${targetYear.y1}-08-01`,
        endDate: `${targetYear.y2}-06-15`,
        isCurrent: false,
      })
      .onConflictDoNothing()
      .returning({ id: schoolYears.id });

    // Lost a race (or conflict) — read it back.
    if (!targetYearRow) {
      [targetYearRow] = await db
        .select({ id: schoolYears.id })
        .from(schoolYears)
        .where(eq(schoolYears.name, targetSchoolYear))
        .limit(1);
    }
  }
  const targetYearId = targetYearRow!.id;

  // ── Guard: don't clobber an existing populated target course ───
  const [targetCourse] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(
      and(
        eq(courses.grade, sourceCourse.grade),
        eq(courses.subject, sourceCourse.subject),
        eq(courses.schoolYearId, targetYearId),
        eq(courses.ownerEmail, ownerEmail),
      ),
    )
    .limit(1);

  if (targetCourse) {
    const [existingUnit] = await db
      .select({ id: units.id })
      .from(units)
      .where(eq(units.courseId, targetCourse.id))
      .limit(1);
    if (existingUnit) {
      return Response.json(
        {
          error: `A Grade ${sourceCourse.grade} ${sourceCourse.subject} course already exists for ${targetSchoolYear} and has units. Delete it first or pick a different year.`,
        },
        { status: 409 },
      );
    }
  }

  if (sourceCourse.schoolYearId === targetYearId && targetCourse?.id === sourceCourse.id) {
    return Response.json(
      { error: "Source and target are the same course." },
      { status: 400 },
    );
  }

  // ── Load the source graph ───
  const srcUnits = await db
    .select()
    .from(units)
    .where(eq(units.courseId, sourceCourseId))
    .orderBy(asc(units.sortOrder));

  if (srcUnits.length === 0) {
    return Response.json({ error: "Source course has no units to clone" }, { status: 400 });
  }

  const srcUnitIds = srcUnits.map((u) => u.id);

  const [srcUnitStds, srcLessons, srcAssessments] = await Promise.all([
    db.select().from(unitStandards).where(inArray(unitStandards.unitId, srcUnitIds)),
    db.select().from(lessons).where(inArray(lessons.unitId, srcUnitIds)).orderBy(asc(lessons.sortOrder)),
    db.select().from(assessments).where(inArray(assessments.unitId, srcUnitIds)).orderBy(asc(assessments.sortOrder)),
  ]);

  const srcLessonIds = srcLessons.map((l) => l.id);
  const srcAssessmentIds = srcAssessments.map((a) => a.id);

  const [srcLessonStds, srcAssessmentStds] = await Promise.all([
    srcLessonIds.length > 0
      ? db.select().from(lessonStandards).where(inArray(lessonStandards.lessonId, srcLessonIds))
      : Promise.resolve([]),
    srcAssessmentIds.length > 0
      ? db.select().from(assessmentStandards).where(inArray(assessmentStandards.assessmentId, srcAssessmentIds))
      : Promise.resolve([]),
  ]);

  // Material attachments across all three attachable types for this course.
  const allAttachableIds = [...srcUnitIds, ...srcLessonIds, ...srcAssessmentIds];
  const srcAttachments =
    allAttachableIds.length > 0
      ? await db
          .select()
          .from(materialAttachments)
          .where(inArray(materialAttachments.attachableId, allAttachableIds))
      : [];

  // ── Build id maps (pre-generate every new id) ───
  const unitIdMap = new Map(srcUnitIds.map((id) => [id, crypto.randomUUID()]));
  const lessonIdMap = new Map(srcLessonIds.map((id) => [id, crypto.randomUUID()]));
  const assessmentIdMap = new Map(srcAssessmentIds.map((id) => [id, crypto.randomUUID()]));

  const newCourseId = targetCourse?.id ?? crypto.randomUUID();
  const userId = session.user?.id;

  // ── Assemble insert rows ───
  const newUnits = srcUnits.map((u) => ({
    id: unitIdMap.get(u.id)!,
    courseId: newCourseId,
    title: u.title,
    sortOrder: u.sortOrder,
    quarter: u.quarter,
    durationWeeks: u.durationWeeks,
    summary: u.summary,
    essentialQuestions: u.essentialQuestions,
    anchorTexts: u.anchorTexts,
    contentWarnings: u.contentWarnings,
    teacherNotes: u.teacherNotes,
    userId,
    aiGenerationContext: u.aiGenerationContext,
    source: u.source,
  }));

  const newUnitStds = srcUnitStds.map((us) => ({
    unitId: unitIdMap.get(us.unitId)!,
    standardId: us.standardId,
    emphasis: us.emphasis,
  }));

  const newLessons = srcLessons.map((l) => ({
    id: lessonIdMap.get(l.id)!,
    unitId: unitIdMap.get(l.unitId)!,
    title: l.title,
    sortOrder: l.sortOrder,
    durationMinutes: l.durationMinutes,
    objectives: l.objectives,
    lessonPlan: l.lessonPlan,
    teacherNotes: l.teacherNotes,
    source: l.source,
    aiGenerationContext: l.aiGenerationContext,
  }));

  const newLessonStds = srcLessonStds.map((ls) => ({
    lessonId: lessonIdMap.get(ls.lessonId)!,
    standardId: ls.standardId,
    coverageType: ls.coverageType,
  }));

  const newAssessments = srcAssessments.map((a) => ({
    id: assessmentIdMap.get(a.id)!,
    unitId: unitIdMap.get(a.unitId)!,
    title: a.title,
    assessmentType: a.assessmentType,
    sortOrder: a.sortOrder,
    description: a.description,
    content: a.content,
    source: a.source,
    aiGenerationContext: a.aiGenerationContext,
  }));

  const newAssessmentStds = srcAssessmentStds.map((as) => ({
    assessmentId: assessmentIdMap.get(as.assessmentId)!,
    standardId: as.standardId,
  }));

  // Re-point each attachment at the cloned entity, keeping the SAME materialId
  // (same Drive file — no duplication).
  const newAttachments = srcAttachments
    .map((at) => {
      let newAttachableId: string | undefined;
      if (at.attachableType === "unit") newAttachableId = unitIdMap.get(at.attachableId);
      else if (at.attachableType === "lesson") newAttachableId = lessonIdMap.get(at.attachableId);
      else if (at.attachableType === "assessment") newAttachableId = assessmentIdMap.get(at.attachableId);
      if (!newAttachableId) return null;
      return {
        materialId: at.materialId,
        attachableType: at.attachableType,
        attachableId: newAttachableId,
        role: at.role,
        sortOrder: at.sortOrder,
      };
    })
    .filter((a): a is NonNullable<typeof a> => a !== null);

  // ── One atomic batch (neon-http has no interactive transactions) ───
  // Parents before children so FK checks pass in statement order.
  const statements = [];
  if (!targetCourse) {
    statements.push(
      db.insert(courses).values({
        id: newCourseId,
        title: title ?? sourceCourse.title,
        grade: sourceCourse.grade,
        subject: sourceCourse.subject,
        schoolYearId: targetYearId,
        ownerEmail,
        description: sourceCourse.description,
        teacherNotes: sourceCourse.teacherNotes,
      }),
    );
  } else if (title) {
    // Reusing an existing empty course — honor the custom title too.
    statements.push(
      db.update(courses).set({ title, updatedAt: new Date() }).where(eq(courses.id, newCourseId)),
    );
  }
  statements.push(db.insert(units).values(newUnits));
  if (newUnitStds.length) statements.push(db.insert(unitStandards).values(newUnitStds));
  if (newLessons.length) statements.push(db.insert(lessons).values(newLessons));
  if (newLessonStds.length) statements.push(db.insert(lessonStandards).values(newLessonStds));
  if (newAssessments.length) statements.push(db.insert(assessments).values(newAssessments));
  if (newAssessmentStds.length) statements.push(db.insert(assessmentStandards).values(newAssessmentStds));
  if (newAttachments.length) statements.push(db.insert(materialAttachments).values(newAttachments));

  try {
    await db.batch(statements as [(typeof statements)[number], ...typeof statements]);
  } catch (err) {
    console.error("[clone-year] batch insert failed", err);
    return Response.json({ error: "Failed to clone curriculum" }, { status: 500 });
  }

  return Response.json({
    courseId: newCourseId,
    targetSchoolYear,
    unitCount: newUnits.length,
    lessonCount: newLessons.length,
    assessmentCount: newAssessments.length,
    materialLinkCount: newAttachments.length,
  });
}
