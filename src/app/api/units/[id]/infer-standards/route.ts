// POST /api/units/[id]/infer-standards
// Uses Claude to infer which standards each lesson covers,
// then persists the mappings to lessonStandards.
// This is a one-time operation per unit — results are saved to DB.

import { db } from "@/db";
import {
  units,
  lessons,
  unitStandards,
  standards,
  lessonStandards,
} from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // ── Load unit, lessons, and standards ───
  const [unit] = await db.select().from(units).where(eq(units.id, id)).limit(1);
  if (!unit) {
    return Response.json({ error: "Unit not found" }, { status: 404 });
  }

  const unitLessons = await db
    .select()
    .from(lessons)
    .where(eq(lessons.unitId, id))
    .orderBy(asc(lessons.sortOrder));

  const linkedStandards = await db
    .select({
      id: standards.id,
      description: standards.description,
      strandCode: standards.strandCode,
    })
    .from(unitStandards)
    .innerJoin(standards, eq(unitStandards.standardId, standards.id))
    .where(eq(unitStandards.unitId, id));

  if (unitLessons.length === 0 || linkedStandards.length === 0) {
    return Response.json(
      { error: "No lessons or standards to map" },
      { status: 400 }
    );
  }

  // ── Build prompt ───
  const standardsList = linkedStandards
    .map((s) => `${s.id}: ${s.description}`)
    .join("\n");

  const lessonsList = unitLessons
    .map((l) => {
      const activities = (l.lessonPlan as { activities?: string[] })?.activities;
      return `Lesson ${l.sortOrder}: "${l.title}"
  Objectives: ${(l.objectives ?? []).join("; ")}
  Activities: ${(activities ?? []).join("; ")}`;
    })
    .join("\n\n");

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: `You map teaching standards to lessons. For each lesson, identify which standards it covers and how.

Coverage types:
- introduces: first exposure to the standard
- teaches: direct instruction on the standard
- reinforces: practice or review of a previously taught standard
- assesses: formal or informal assessment of the standard

Return ONLY a JSON array:
[{"lessonSortOrder": 1, "standards": [{"id": "8.RL.1.A", "coverageType": "teaches"}, ...]}, ...]

Every lesson should have at least one standard. Be specific — don't assign standards that aren't actually addressed by the lesson's objectives and activities.
No markdown fencing, no explanation — just the JSON array.`,
    messages: [
      {
        role: "user",
        content: `Unit: "${unit.title}"

Standards for this unit:
${standardsList}

Lessons:
${lessonsList}`,
      },
    ],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";

  let mappings: Array<{
    lessonSortOrder: number;
    standards: Array<{ id: string; coverageType: string }>;
  }>;

  try {
    mappings = JSON.parse(text);
  } catch {
    return Response.json(
      { error: "Failed to parse AI response", raw: text },
      { status: 500 }
    );
  }

  // ── Persist to DB ───
  const validStandardIds = new Set(linkedStandards.map((s) => s.id));
  const lessonBySort = new Map(unitLessons.map((l) => [l.sortOrder, l.id]));
  let inserted = 0;

  for (const m of mappings) {
    const lessonId = lessonBySort.get(m.lessonSortOrder);
    if (!lessonId) continue;

    for (const s of m.standards) {
      if (!validStandardIds.has(s.id)) continue;
      await db
        .insert(lessonStandards)
        .values({
          lessonId,
          standardId: s.id,
          coverageType: s.coverageType,
        })
        .onConflictDoNothing();
      inserted++;
    }
  }

  return Response.json({
    message: `Mapped ${inserted} lesson-standard connections`,
    lessonCount: unitLessons.length,
    standardCount: linkedStandards.length,
  });
}
