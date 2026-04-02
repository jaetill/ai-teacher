// POST /api/year-plan/save
// Saves an AI-generated year plan to the database.
// Creates or finds a course for the grade, then inserts units.

import { db } from "@/db";
import { courses, units, unitStandards, standards } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

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
  const body = (await req.json()) as {
    grade: number;
    schoolYear: string;
    units: UnitInput[];
    rawPlan?: string;
  };

  // ── Find or create course ───
  const existing = await db
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.grade, body.grade))
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
