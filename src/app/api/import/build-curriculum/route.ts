// POST /api/import/build-curriculum
// After files are imported to Drive, this endpoint uses AI to build
// the full curriculum structure: unit, lessons, standards, material links.
//
// Input: { grade: number, quarter: string }
// Returns: { unitId, lessonCount, standardCount, materialLinkCount }

import { db } from "@/db";
import {
  courses,
  units,
  lessons,
  standards,
  unitStandards,
  lessonStandards,
  materials,
  materialAttachments,
  driveFolders,
  schoolYears,
} from "@/db/schema";
import { eq, inArray, asc } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function POST(req: Request) {
  const { grade, quarter } = (await req.json()) as {
    grade: number;
    quarter: string; // "Q1", "Q2", etc.
  };

  if (!grade || !quarter) {
    return Response.json({ error: "grade and quarter required" }, { status: 400 });
  }

  // ── 1. Find materials in this quarter's folders ───
  const categories = ["Curriculum", "Lessons", "Activities", "Assessments", "Resources"];
  const folderKeys = categories.map((c) => `grade_${grade}_${quarter}_${c}`);

  const folders = await db
    .select({ folderKey: driveFolders.folderKey, driveId: driveFolders.driveId })
    .from(driveFolders)
    .where(inArray(driveFolders.folderKey, folderKeys));

  const folderDriveIds = folders.map((f) => f.driveId);
  const driveIdToCategory = new Map(
    folders.map((f) => [f.driveId, f.folderKey.split("_").pop()!])
  );

  if (folderDriveIds.length === 0) {
    return Response.json({ error: "No Drive folders found for this quarter" }, { status: 400 });
  }

  const quarterMaterials = await db
    .select()
    .from(materials)
    .where(inArray(materials.driveFolderId, folderDriveIds));

  if (quarterMaterials.length === 0) {
    return Response.json({
      error: "No materials found in this quarter. Import files first.",
    }, { status: 400 });
  }

  // ── 2. Load standards for this grade ───
  const gradeStandards = await db
    .select({ id: standards.id, description: standards.description })
    .from(standards)
    .where(eq(standards.grade, grade))
    .orderBy(asc(standards.id));

  // ── 3. Build AI prompt ───
  const materialList = quarterMaterials
    .map((m) => {
      const cat = driveIdToCategory.get(m.driveFolderId ?? "") ?? "unknown";
      return `- "${m.title}" (type: ${m.materialType}, folder: ${cat})`;
    })
    .join("\n");

  const standardsList = gradeStandards
    .map((s) => `${s.id}: ${s.description}`)
    .join("\n");

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    system: `You are building a curriculum unit from a set of teaching materials (files).
Analyze the file names, types, and folder categories to understand the unit's content.
Generate a complete unit structure with lessons, and map standards and materials to lessons.

Return ONLY valid JSON (no markdown fencing) with this structure:
{
  "unit": {
    "title": "Unit title — descriptive thematic name",
    "durationWeeks": 7,
    "summary": "2-3 sentence summary of what students learn",
    "essentialQuestions": "Key questions separated by newlines",
    "anchorTexts": "Primary texts used",
    "contentWarnings": "Any sensitive content notes, or null"
  },
  "lessons": [
    {
      "sortOrder": 1,
      "title": "Lesson title",
      "durationMinutes": 45,
      "objectives": ["objective 1", "objective 2"],
      "activities": ["activity 1", "activity 2"],
      "standards": [{"id": "8.RL.1.A", "coverageType": "teaches"}],
      "materials": [{"title": "exact filename.docx", "role": "primary"}]
    }
  ],
  "unitStandards": ["8.RL.1.A", "8.RL.2.B"]
}

Rules:
- Generate 15-25 lessons (typical quarter is ~7 weeks, 3 lessons/week)
- Every material should be linked to at least one lesson
- materials[].title must exactly match one of the provided filenames
- standards[].id must be from the provided standards list
- coverageType: "introduces" | "teaches" | "reinforces" | "assesses"
- role: "primary" | "supporting" | "teacher_reference"
- unitStandards: all unique standards covered across lessons`,
    messages: [
      {
        role: "user",
        content: `Build a Grade ${grade} English ${quarter} unit from these materials:

Materials (${quarterMaterials.length} files):
${materialList}

Available standards for Grade ${grade}:
${standardsList}`,
      },
    ],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";

  let parsed: {
    unit: {
      title: string;
      durationWeeks: number;
      summary: string;
      essentialQuestions: string;
      anchorTexts: string;
      contentWarnings: string | null;
    };
    lessons: Array<{
      sortOrder: number;
      title: string;
      durationMinutes: number;
      objectives: string[];
      activities: string[];
      standards: Array<{ id: string; coverageType: string }>;
      materials: Array<{ title: string; role: string }>;
    }>;
    unitStandards: string[];
  };

  try {
    parsed = JSON.parse(text);
  } catch {
    return Response.json(
      { error: "Failed to parse AI response", raw: text.substring(0, 500) },
      { status: 500 }
    );
  }

  // ── 4. Find or create course ───
  const [existingCourse] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.grade, grade))
    .limit(1);

  let courseId: string;
  if (existingCourse) {
    courseId = existingCourse.id;
  } else {
    const [currentYear] = await db
      .select({ id: schoolYears.id })
      .from(schoolYears)
      .where(eq(schoolYears.isCurrent, true))
      .limit(1);

    const [newCourse] = await db
      .insert(courses)
      .values({
        title: `Grade ${grade} English Language Arts`,
        grade,
        subject: "ELA",
        schoolYearId: currentYear?.id ?? null,
      })
      .returning({ id: courses.id });
    courseId = newCourse.id;
  }

  // ── 5. Determine sort order for new unit ───
  const existingUnits = await db
    .select({ sortOrder: units.sortOrder })
    .from(units)
    .where(eq(units.courseId, courseId))
    .orderBy(asc(units.sortOrder));

  // Quarter number → sort order (Q1=1, Q2=2, etc.)
  const quarterNum = parseInt(quarter.replace("Q", ""));
  // Use quarter number * 2 - 1 as sort order (leaves room for multiple units per quarter)
  const sortOrder = existingUnits.length > 0
    ? Math.max(...existingUnits.map((u) => u.sortOrder)) + 1
    : quarterNum * 2 - 1;

  // ── 6. Create unit ───
  const [createdUnit] = await db
    .insert(units)
    .values({
      courseId,
      title: parsed.unit.title,
      sortOrder,
      durationWeeks: parsed.unit.durationWeeks,
      summary: parsed.unit.summary,
      essentialQuestions: parsed.unit.essentialQuestions || null,
      anchorTexts: parsed.unit.anchorTexts || null,
      contentWarnings: parsed.unit.contentWarnings || null,
      source: "ai",
    })
    .returning({ id: units.id });

  // ── 7. Link unit standards ───
  const validStdIds = new Set(gradeStandards.map((s) => s.id));
  const unitStdCodes = (parsed.unitStandards ?? []).filter((s) => validStdIds.has(s));
  let standardCount = 0;

  if (unitStdCodes.length > 0) {
    await db.insert(unitStandards).values(
      unitStdCodes.map((s) => ({
        unitId: createdUnit.id,
        standardId: s,
        emphasis: "primary" as const,
      }))
    );
    standardCount = unitStdCodes.length;
  }

  // ── 8. Create lessons + lesson standards + material attachments ───
  const materialByTitle = new Map(
    quarterMaterials.map((m) => [m.title.toLowerCase(), m.id])
  );

  let lessonCount = 0;
  let materialLinkCount = 0;
  let lessonStdCount = 0;

  for (const lessonData of parsed.lessons) {
    const [createdLesson] = await db
      .insert(lessons)
      .values({
        unitId: createdUnit.id,
        title: lessonData.title,
        sortOrder: lessonData.sortOrder,
        durationMinutes: lessonData.durationMinutes || 45,
        objectives: lessonData.objectives ?? [],
        lessonPlan: { activities: lessonData.activities ?? [] },
        source: "ai",
      })
      .returning({ id: lessons.id });
    lessonCount++;

    // Lesson standards
    for (const std of lessonData.standards ?? []) {
      if (!validStdIds.has(std.id)) continue;
      await db
        .insert(lessonStandards)
        .values({
          lessonId: createdLesson.id,
          standardId: std.id,
          coverageType: std.coverageType || "teaches",
        })
        .onConflictDoNothing();
      lessonStdCount++;
    }

    // Material attachments
    for (const mat of lessonData.materials ?? []) {
      const materialId = materialByTitle.get(mat.title.toLowerCase());
      if (!materialId) continue;
      await db
        .insert(materialAttachments)
        .values({
          materialId,
          attachableType: "lesson",
          attachableId: createdLesson.id,
          role: mat.role || "supporting",
          sortOrder: 0,
        })
        .onConflictDoNothing();
      materialLinkCount++;
    }
  }

  return Response.json({
    unitId: createdUnit.id,
    unitTitle: parsed.unit.title,
    lessonCount,
    standardCount,
    lessonStdCount,
    materialLinkCount,
    materialCount: quarterMaterials.length,
  });
}
