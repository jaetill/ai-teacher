// POST /api/year-plan/save
// Saves an AI-generated year plan to the database.
// Creates or finds a course for the grade, then inserts units.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireEmail } from "@/lib/auth-helpers";
import { db } from "@/db";
import { courses, units, unitStandards, standards, schoolYears } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";

type UnitInput = {
  title: string;
  weeks: number;
  standards: string;
  summary: string;
  anchorTexts: string;
  flags: string;
};

// Extract standard codes like "8.RL.1.A" from a text string
function parseStandardCodes(text: string): string[] {
  const pattern = /\b\d\.[A-Z]{1,3}\.\d\.[A-Z]\b/g;
  return [...new Set(text.match(pattern) ?? [])];
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionEmail = requireEmail(session);
  if (!sessionEmail) {
    return Response.json({ error: "Session missing email" }, { status: 401 });
  }

  const body = (await req.json()) as {
    grade: number;
    schoolYear: string;
    units: UnitInput[];
    rawPlan?: string;
  };

  if (!body.grade || !body.schoolYear || !Array.isArray(body.units) || body.units.length === 0) {
    return Response.json(
      { error: "grade, schoolYear, and units are required" },
      { status: 400 },
    );
  }

  // Bound the array: each unit triggers DB inserts in a loop, so an unbounded
  // units[] is an authenticated resource-exhaustion vector (#513). A school year
  // has at most a few dozen units; 100 is a generous ceiling.
  const MAX_UNITS = 100;
  if (body.units.length > MAX_UNITS) {
    return Response.json(
      { error: `Too many units (max ${MAX_UNITS})` },
      { status: 400 },
    );
  }

  if (body.rawPlan && body.rawPlan.length > 50_000) {
    return Response.json({ error: "rawPlan too large" }, { status: 400 });
  }

  // Validate each unit's required fields before any DB work (#540). The units
  // come from an AI-generated plan / the client, so their shape isn't trusted.
  for (const u of body.units) {
    if (!u || typeof u.title !== "string" || u.title.trim().length === 0) {
      return Response.json(
        { error: "each unit requires a non-empty title" },
        { status: 400 },
      );
    }
    if (typeof u.weeks !== "number" || !Number.isFinite(u.weeks)) {
      return Response.json(
        { error: "each unit requires a numeric weeks value" },
        { status: 400 },
      );
    }
  }

  // ── Resolve school year ───
  const schoolYearRows = await db
    .select({ id: schoolYears.id })
    .from(schoolYears)
    .where(eq(schoolYears.name, body.schoolYear))
    .limit(1);

  if (schoolYearRows.length === 0) {
    return Response.json(
      { error: `School year "${body.schoolYear}" not found` },
      { status: 400 },
    );
  }
  const schoolYearId = schoolYearRows[0].id;

  // ── Find or create course ───
  const existing = await db
    .select({ id: courses.id })
    .from(courses)
    .where(
      and(
        eq(courses.grade, body.grade),
        eq(courses.ownerEmail, sessionEmail),
        eq(courses.schoolYearId, schoolYearId),
      )
    )
    .limit(1);

  let courseId: string;
  if (existing.length > 0) {
    courseId = existing[0].id;
  } else {
    const [newCourse] = await db
      .insert(courses)
      .values({
        title: `Grade ${body.grade} English Language Arts`,
        grade: body.grade,
        subject: "ELA",
        ownerEmail: sessionEmail,
        schoolYearId,
      })
      .returning({ id: courses.id });
    courseId = newCourse.id;
  }

  // ── Insert units ───
  const createdUnits: { id: string; title: string }[] = [];

  for (let i = 0; i < body.units.length; i++) {
    const u = body.units[i];
    const [inserted] = await db
      .insert(units)
      .values({
        courseId,
        title: u.title,
        sortOrder: i + 1,
        durationWeeks: u.weeks,
        summary: u.summary,
        anchorTexts: u.anchorTexts || null,
        contentWarnings: u.flags && u.flags !== "None" ? u.flags : null,
        userId: session.user?.id,
        source: "ai",
        aiGenerationContext: body.rawPlan
          ? { rawPlan: body.rawPlan }
          : null,
      })
      .returning({ id: units.id });

    createdUnits.push({ id: inserted.id, title: u.title });

    // ── Link standards ───
    const codes = parseStandardCodes(u.standards);
    if (codes.length > 0) {
      const matchedStandards = await db
        .select({ id: standards.id })
        .from(standards)
        .where(inArray(standards.id, codes));

      if (matchedStandards.length > 0) {
        await db.insert(unitStandards).values(
          matchedStandards.map((s) => ({
            unitId: inserted.id,
            standardId: s.id,
            emphasis: "primary" as const,
          }))
        );
      }
    }
  }

  return Response.json({ courseId, units: createdUnits });
}
