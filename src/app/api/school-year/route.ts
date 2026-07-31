// /api/school-year — calendar settings that belong to the YEAR, not a course.
//
// Jason 2026-07-31: "the start/end date of the school year, and each quarter,
// would be more user friendly at a school year level, so the teacher does not
// have to adjust each one." Quarter spans and no-school days were already
// stored per school year (terms rows keyed by schoolYearId) but edited on each
// course's calendar — so setting Grade 7's dates silently moved Grade 8's.
// This endpoint puts the editing where the data lives; per-course/per-section
// settings (which days a class meets) stay on /api/schedule/[courseId].
//
// Snow days live here on purpose: a snow day closes the school, so every
// section should feel it. A single section losing a day to an assembly is a
// different thing — that's the per-section overlay in #669.
//
// GET  → current year (or ?id=) with dates, quarter spans, no-school days.
// PUT  → { schoolYearId?, startDate?, endDate?, quarterSpans?, noSchoolDays? }
//
// Note: school_years is global reference data (no owner column, unlike
// courses) — consistent with how the rest of the app treats years today.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { schoolYears, terms } from "@/db/schema";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { isUuid, readJson } from "@/lib/api-utils";

const QUARTER_NAMES = ["Summer", "Q1", "Q2", "Q3", "Q4"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function loadYear(id: string | null) {
  if (id) {
    const [row] = await db.select().from(schoolYears).where(eq(schoolYears.id, id)).limit(1);
    return row ?? null;
  }
  const [current] = await db
    .select()
    .from(schoolYears)
    .where(eq(schoolYears.isCurrent, true))
    .limit(1);
  if (current) return current;
  // No year flagged current: fall back to the newest, so the settings page is
  // never dead-ended.
  const [newest] = await db.select().from(schoolYears).orderBy(desc(schoolYears.name)).limit(1);
  return newest ?? null;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const idParam = searchParams.get("id");
  if (idParam && !isUuid(idParam)) {
    return Response.json({ error: "Invalid school year id" }, { status: 400 });
  }

  const year = await loadYear(idParam);
  if (!year) {
    return Response.json({ error: "No school year found" }, { status: 404 });
  }

  const rows = await db
    .select({
      termType: terms.termType,
      name: terms.name,
      startDate: terms.startDate,
      endDate: terms.endDate,
    })
    .from(terms)
    .where(
      and(eq(terms.schoolYearId, year.id), inArray(terms.termType, ["quarter", "no_school"])),
    )
    .orderBy(asc(terms.startDate));

  return Response.json({
    schoolYear: {
      id: year.id,
      name: year.name,
      startDate: year.startDate,
      endDate: year.endDate,
      isCurrent: year.isCurrent,
    },
    quarterSpans: rows
      .filter((r) => r.termType === "quarter")
      .map((r) => ({ name: r.name, startDate: r.startDate, endDate: r.endDate })),
    noSchoolDays: rows
      .filter((r) => r.termType === "no_school")
      .map((r) => ({ date: r.startDate, label: r.name })),
  });
}

type PutBody = {
  schoolYearId?: string;
  startDate?: string;
  endDate?: string;
  quarterSpans?: { name: string; startDate: string; endDate: string }[];
  noSchoolDays?: { date: string; label?: string }[];
};

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = await readJson<PutBody>(req);
  if (!body) return Response.json({ error: "Invalid JSON body" }, { status: 400 });

  if (body.schoolYearId && !isUuid(body.schoolYearId)) {
    return Response.json({ error: "Invalid school year id" }, { status: 400 });
  }
  const year = await loadYear(body.schoolYearId ?? null);
  if (!year) return Response.json({ error: "No school year found" }, { status: 404 });

  // ── Validate ───
  const start = body.startDate ?? year.startDate;
  const end = body.endDate ?? year.endDate;
  if (!ISO_DATE.test(start) || !ISO_DATE.test(end) || start > end) {
    return Response.json({ error: "Invalid school year dates" }, { status: 400 });
  }
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
  if (noSchool.length > 200) {
    return Response.json({ error: "Too many no-school days" }, { status: 400 });
  }
  for (const d of noSchool) {
    if (!ISO_DATE.test(d.date ?? "")) {
      return Response.json({ error: "Invalid no-school date" }, { status: 400 });
    }
  }

  // ── Apply (replace-by-type keeps it idempotent) ───
  if (body.startDate !== undefined || body.endDate !== undefined) {
    await db
      .update(schoolYears)
      .set({ startDate: start, endDate: end })
      .where(eq(schoolYears.id, year.id));
  }
  if (body.quarterSpans !== undefined) {
    await db
      .delete(terms)
      .where(and(eq(terms.schoolYearId, year.id), eq(terms.termType, "quarter")));
    if (spans.length > 0) {
      await db.insert(terms).values(
        spans.map((s, i) => ({
          schoolYearId: year.id,
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
      .where(and(eq(terms.schoolYearId, year.id), eq(terms.termType, "no_school")));
    if (noSchool.length > 0) {
      await db.insert(terms).values(
        noSchool.map((d, i) => ({
          schoolYearId: year.id,
          termType: "no_school",
          name: (d.label ?? "No school").slice(0, 120),
          sortOrder: i,
          startDate: d.date,
          endDate: d.date,
        })),
      );
    }
  }

  return Response.json({ ok: true, schoolYearId: year.id });
}
