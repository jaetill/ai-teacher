// GET /api/schedule/[courseId] — calendar inputs for a course: its school
//                                year, quarter date spans (terms), no-school
//                                days, and meeting days.
// PUT /api/schedule/[courseId] — save those inputs (upsert quarter terms,
//                                replace no-school days, update meeting days).
//
// Design (#646 first slice): the app stores only the INPUT streams — quarter
// spans, meeting days, no-school days. Lesson dates are derived client-side
// by src/lib/schedule.ts, so a snow day is one row here and zero rows of
// per-lesson reschedule state. Quarter spans live in the scaffold-era `terms`
// table (termType 'quarter'); no-school days reuse the same table with
// termType 'no_school' (start = end = the day, name = the label) — a span
// type in a span table, no new table needed.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { courses, schoolYears, terms } from "@/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { isUuid, readJson } from "@/lib/api-utils";

const QUARTER_NAMES = ["Summer", "Q1", "Q2", "Q3", "Q4"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function loadOwnedCourse(courseId: string, ownerEmail: string) {
  const [course] = await db
    .select({
      id: courses.id,
      grade: courses.grade,
      title: courses.title,
      schoolYearId: courses.schoolYearId,
      meetingDays: courses.meetingDays,
    })
    .from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.ownerEmail, ownerEmail)))
    .limit(1);
  return course ?? null;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const session = await getServerSession(authOptions);
  const ownerEmail = session?.user?.email;
  if (!ownerEmail) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { courseId } = await params;
  if (!isUuid(courseId)) {
    return Response.json({ error: "Invalid courseId" }, { status: 400 });
  }
  const course = await loadOwnedCourse(courseId, ownerEmail);
  if (!course) {
    return Response.json({ error: "Course not found" }, { status: 404 });
  }

  let schoolYear: { id: string; name: string; startDate: string; endDate: string } | null = null;
  let quarterSpans: { name: string; startDate: string; endDate: string }[] = [];
  let noSchoolDays: { date: string; label: string }[] = [];

  if (course.schoolYearId) {
    const [sy] = await db
      .select({
        id: schoolYears.id,
        name: schoolYears.name,
        startDate: schoolYears.startDate,
        endDate: schoolYears.endDate,
      })
      .from(schoolYears)
      .where(eq(schoolYears.id, course.schoolYearId))
      .limit(1);
    schoolYear = sy ?? null;

    const rows = await db
      .select({
        termType: terms.termType,
        name: terms.name,
        startDate: terms.startDate,
        endDate: terms.endDate,
      })
      .from(terms)
      .where(
        and(
          eq(terms.schoolYearId, course.schoolYearId),
          inArray(terms.termType, ["quarter", "no_school"]),
        ),
      )
      .orderBy(asc(terms.startDate));
    quarterSpans = rows
      .filter((r) => r.termType === "quarter")
      .map((r) => ({ name: r.name, startDate: r.startDate, endDate: r.endDate }));
    noSchoolDays = rows
      .filter((r) => r.termType === "no_school")
      .map((r) => ({ date: r.startDate, label: r.name }));
  }

  return Response.json({
    course: { id: course.id, grade: course.grade, title: course.title },
    meetingDays: course.meetingDays,
    schoolYear,
    quarterSpans,
    noSchoolDays,
  });
}

type PutBody = {
  meetingDays?: string;
  quarterSpans?: { name: string; startDate: string; endDate: string }[];
  noSchoolDays?: { date: string; label?: string }[];
};

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const session = await getServerSession(authOptions);
  const ownerEmail = session?.user?.email;
  if (!ownerEmail) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { courseId } = await params;
  if (!isUuid(courseId)) {
    return Response.json({ error: "Invalid courseId" }, { status: 400 });
  }
  const course = await loadOwnedCourse(courseId, ownerEmail);
  if (!course) {
    return Response.json({ error: "Course not found" }, { status: 404 });
  }
  if (!course.schoolYearId) {
    return Response.json(
      { error: "Course has no school year assigned; assign one first." },
      { status: 400 },
    );
  }

  const body = await readJson<PutBody>(req);
  if (!body) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // ── Validate ───
  const spans = body.quarterSpans ?? [];
  if (spans.length > 10) {
    return Response.json({ error: "Too many quarter spans" }, { status: 400 });
  }
  for (const s of spans) {
    if (
      !QUARTER_NAMES.includes(s.name) ||
      !ISO_DATE.test(s.startDate ?? "") ||
      !ISO_DATE.test(s.endDate ?? "") ||
      s.startDate > s.endDate
    ) {
      return Response.json({ error: `Invalid quarter span: ${s.name}` }, { status: 400 });
    }
  }
  const noSchool = body.noSchoolDays ?? [];
  if (noSchool.length > 120) {
    return Response.json({ error: "Too many no-school days" }, { status: 400 });
  }
  for (const d of noSchool) {
    if (!ISO_DATE.test(d.date ?? "")) {
      return Response.json({ error: `Invalid no-school date` }, { status: 400 });
    }
  }
  if (body.meetingDays !== undefined) {
    const days = body.meetingDays.split(",").map((x) => parseInt(x.trim(), 10));
    if (days.length === 0 || days.some((n) => !(n >= 1 && n <= 7))) {
      return Response.json({ error: "Invalid meetingDays" }, { status: 400 });
    }
  }

  // ── Apply: replace-by-type keeps this simple and idempotent ───
  if (body.meetingDays !== undefined) {
    await db
      .update(courses)
      .set({ meetingDays: body.meetingDays })
      .where(eq(courses.id, courseId));
  }
  if (body.quarterSpans !== undefined) {
    await db
      .delete(terms)
      .where(and(eq(terms.schoolYearId, course.schoolYearId), eq(terms.termType, "quarter")));
    if (spans.length > 0) {
      await db.insert(terms).values(
        spans.map((s, i) => ({
          schoolYearId: course.schoolYearId!,
          termType: "quarter",
          name: s.name,
          sortOrder: i,
          startDate: s.startDate,
          endDate: s.endDate,
        })),
      );
    }
  }
  if (body.noSchoolDays !== undefined) {
    await db
      .delete(terms)
      .where(and(eq(terms.schoolYearId, course.schoolYearId), eq(terms.termType, "no_school")));
    if (noSchool.length > 0) {
      await db.insert(terms).values(
        noSchool.map((d, i) => ({
          schoolYearId: course.schoolYearId!,
          termType: "no_school",
          name: (d.label ?? "No school").slice(0, 120),
          sortOrder: i,
          startDate: d.date,
          endDate: d.date,
        })),
      );
    }
  }

  return Response.json({ ok: true });
}
