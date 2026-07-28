// POST /api/import/build-curriculum
// Auth: requires Google OAuth session
// After files are imported to Drive, this endpoint uses AI to build
// the full curriculum structure: unit, lessons, standards, material links.
//
// Input: { grade: number, quarter: string }
// Returns: { unitId, lessonCount, standardCount, materialLinkCount }

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
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
import { eq, inArray, asc, and, isNull, or } from "drizzle-orm";
import { getAnthropic } from "@/lib/anthropic";
import { checkAiRateLimit } from "@/lib/rate-limit";
import { normalizeMaterialRole } from "@/lib/material-roles";
import { readJson } from "@/lib/api-utils";


const VALID_COVERAGE_TYPES = new Set([
  "introduces",
  "teaches",
  "reinforces",
  "assesses",
]);

export const maxDuration = 120; // Allow up to 2 minutes for this endpoint

export async function POST(req: Request) {
  try {
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ownerEmail = session.user?.email;
  if (!ownerEmail) {
    return Response.json({ error: "Session missing email" }, { status: 401 });
  }

  const rateLimited = await checkAiRateLimit(ownerEmail);
  if (rateLimited) return rateLimited;

  const reqBody = await readJson<{
    grade: number;
    quarter: string; // "Q1", "Q2", etc.
  }>(req);
  if (!reqBody) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { grade, quarter } = reqBody;

  if (
    typeof grade !== "number" ||
    !grade ||
    typeof quarter !== "string" ||
    !quarter ||
    quarter.length > 10
  ) {
    return Response.json({ error: "grade and quarter required" }, { status: 400 });
  }

  // ── 1. Find materials in this quarter's folders ───
  const categories = ["Curriculum", "Lessons", "Activities", "Assessments", "Resources"];
  const folderKeys = categories.map((c) => `grade_${grade}_${quarter}_${c}`);

  // Scope folder lookup by owner (#121): drive_folders.folder_key is unique only
  // per owner now, so another user's same grade/quarter folders must not leak in.
  // Open-null policy (ADR-0044) keeps legacy NULL-owner rows visible.
  const folders = await db
    .select({ folderKey: driveFolders.folderKey, driveId: driveFolders.driveId })
    .from(driveFolders)
    .where(
      and(
        inArray(driveFolders.folderKey, folderKeys),
        or(
          eq(driveFolders.ownerEmail, ownerEmail),
          isNull(driveFolders.ownerEmail)
        )
      )
    );

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

  const message = await getAnthropic().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 16384,
    system: `You are building a curriculum for ONE quarter from a set of teaching materials (files).
A quarter contains ONE OR MORE units — usually one unit per novel or major topic. Analyze the
file names, types, and folder categories, and GROUP the materials into distinct units.

Return ONLY valid JSON (no markdown fencing) with this structure:
{
  "units": [
    {
      "title": "Unit title — a descriptive thematic name (often the novel or topic)",
      "durationWeeks": 4,
      "summary": "2-3 sentence summary of what students learn",
      "essentialQuestions": "Key questions separated by newlines",
      "anchorTexts": "Primary texts used",
      "contentWarnings": "Any sensitive content notes, or null",
      "lessons": [
        {
          "sortOrder": 1,
          "title": "Lesson title",
          "durationMinutes": 45,
          "objectives": ["objective 1", "objective 2"],
          "activities": ["activity 1", "activity 2"],
          "standards": [{"id": "7.RL.1.A", "coverageType": "teaches"}],
          "materials": [{"title": "exact filename.docx", "role": "primary"}]
        }
      ],
      "unitStandards": ["7.RL.1.A", "7.RL.2.B"]
    }
  ]
}

Rules:
- Group the materials into 1-4 units per quarter — usually one unit per novel or major topic.
  A small topic (e.g. a 1-2 week media-literacy or intro unit) can be its own short unit.
- Each unit's lessons: ~10-15 for a full novel, ~3-6 for a short unit.
- lessons[].sortOrder restarts at 1 within EACH unit.
- Order the units array in a sensible teaching sequence for the quarter.
- Every material must be linked to at least one lesson in the unit it belongs to.
- materials[].title must exactly match one of the provided filenames.
- standards[].id must be from the provided standards list.
- coverageType: "introduces" | "teaches" | "reinforces" | "assesses"
- role: "primary" | "supporting" | "teacher_reference"
- unitStandards: all unique standards covered across that unit's lessons`,
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

  type ParsedUnit = {
    title: string;
    durationWeeks: number;
    summary: string;
    essentialQuestions: string;
    anchorTexts: string;
    contentWarnings: string | null;
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
  let parsed: { units: ParsedUnit[] };

  try {
    parsed = JSON.parse(text);
  } catch {
    console.error("[build-curriculum] unparseable AI response:", text.substring(0, 500));
    return Response.json({ error: "Failed to parse AI response" }, { status: 500 });
  }

  const parsedUnits = Array.isArray(parsed.units) ? parsed.units : [];
  if (parsedUnits.length === 0) {
    return Response.json(
      { error: "The AI did not return any units for this quarter." },
      { status: 500 },
    );
  }

  // Clamp AI-supplied numbers to the smallint columns' safe ranges so an
  // out-of-range value can't throw an uncaught DB error mid-build (#eval-2026-07).
  const clampWeeks = (n: unknown) =>
    Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 20 ? (n as number) : 2;
  const clampMinutes = (n: unknown) =>
    Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 600 ? (n as number) : 45;

  // ── 4. Find or create course ───
  const [currentYear] = await db
    .select({ id: schoolYears.id })
    .from(schoolYears)
    .where(eq(schoolYears.isCurrent, true))
    .limit(1);

  // Select-before-insert: uq_courses_grade_subject_year_owner is NULLS
  // DISTINCT on databases that predate the NULLS NOT DISTINCT migration, so
  // when no school year is marked current (schoolYearId = NULL) the
  // onConflictDoNothing() below never fires and every import used to create a
  // duplicate course row, fracturing units across courses (#eval-2026-07).
  const yearFilter = currentYear?.id
    ? eq(courses.schoolYearId, currentYear.id)
    : isNull(courses.schoolYearId);
  const courseWhere = and(
    eq(courses.grade, grade),
    eq(courses.subject, "ELA"),
    yearFilter,
    eq(courses.ownerEmail, ownerEmail),
  );

  let [course] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(courseWhere)
    .limit(1);

  if (!course) {
    [course] = await db
      .insert(courses)
      .values({
        title: `Grade ${grade} English Language Arts`,
        grade,
        subject: "ELA",
        schoolYearId: currentYear?.id ?? null,
        ownerEmail,
      })
      .onConflictDoNothing()
      .returning({ id: courses.id });
  }

  if (!course) {
    // Lost a concurrent-create race; the row exists now.
    [course] = await db
      .select({ id: courses.id })
      .from(courses)
      .where(courseWhere)
      .limit(1);
  }

  if (!course) {
    return Response.json(
      { error: "Course not found or could not be created" },
      { status: 500 }
    );
  }

  const courseId = course.id;

  // ── 5. Determine the starting sort order (append after any existing units) ───
  const existingUnits = await db
    .select({ sortOrder: units.sortOrder })
    .from(units)
    .where(eq(units.courseId, courseId))
    .orderBy(asc(units.sortOrder));

  const baseSortOrder =
    existingUnits.length > 0 ? Math.max(...existingUnits.map((u) => u.sortOrder)) + 1 : 1;

  const validStdIds = new Set(gradeStandards.map((s) => s.id));
  const materialByTitle = new Map(quarterMaterials.map((m) => [m.title.toLowerCase(), m.id]));

  // ── 6-8. Create each unit, its standards, lessons, and material links ───
  const createdUnits: Array<{ id: string; title: string }> = [];
  let lessonCount = 0;
  let materialLinkCount = 0;
  let lessonStdCount = 0;
  let standardCount = 0;

  for (let i = 0; i < parsedUnits.length; i++) {
    const u = parsedUnits[i];

    const [createdUnit] = await db
      .insert(units)
      .values({
        courseId,
        title: u.title,
        sortOrder: baseSortOrder + i,
        quarter,
        durationWeeks: clampWeeks(u.durationWeeks),
        summary: u.summary,
        essentialQuestions: u.essentialQuestions || null,
        anchorTexts: u.anchorTexts || null,
        contentWarnings: u.contentWarnings || null,
        userId: session.user?.id,
        source: "ai",
      })
      .returning({ id: units.id });
    createdUnits.push({ id: createdUnit.id, title: u.title });

    // Unit standards
    const unitStdCodes = (u.unitStandards ?? []).filter((s) => validStdIds.has(s));
    if (unitStdCodes.length > 0) {
      await db.insert(unitStandards).values(
        unitStdCodes.map((s) => ({
          unitId: createdUnit.id,
          standardId: s,
          emphasis: "primary" as const,
        })),
      );
      standardCount += unitStdCodes.length;
    }

    // Lessons + lesson standards + material attachments
    for (const lessonData of u.lessons ?? []) {
      const [createdLesson] = await db
        .insert(lessons)
        .values({
          unitId: createdUnit.id,
          title: lessonData.title,
          sortOrder: lessonData.sortOrder,
          durationMinutes: clampMinutes(lessonData.durationMinutes),
          objectives: lessonData.objectives ?? [],
          lessonPlan: { activities: lessonData.activities ?? [] },
          source: "ai",
        })
        .returning({ id: lessons.id });
      lessonCount++;

      for (const std of lessonData.standards ?? []) {
        if (!validStdIds.has(std.id)) continue;
        const coverageType = std.coverageType || "teaches";
        if (!VALID_COVERAGE_TYPES.has(coverageType)) continue;
        await db
          .insert(lessonStandards)
          .values({ lessonId: createdLesson.id, standardId: std.id, coverageType })
          .onConflictDoNothing();
        lessonStdCount++;
      }

      for (const mat of lessonData.materials ?? []) {
        const materialId = materialByTitle.get(mat.title.toLowerCase());
        if (!materialId) continue;
        await db
          .insert(materialAttachments)
          .values({
            materialId,
            attachableType: "lesson",
            attachableId: createdLesson.id,
            role: normalizeMaterialRole(mat.role),
            sortOrder: 0,
          })
          .onConflictDoNothing();
        materialLinkCount++;
      }
    }
  }

  return Response.json({
    courseId,
    unitCount: createdUnits.length,
    units: createdUnits,
    lessonCount,
    standardCount,
    lessonStdCount,
    materialLinkCount,
    materialCount: quarterMaterials.length,
  });
  } catch (err) {
    // Log the full error server-side, but never return err.message to the
    // client — it can leak DB internals, query fragments, or upstream details.
    console.error("build-curriculum error:", err);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
