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
  assessments,
  standards,
  unitStandards,
  lessonStandards,
  materials,
  materialAttachments,
  driveFolders,
  schoolYears,
  lessonTemplates,
} from "@/db/schema";
import { eq, inArray, asc, and, isNull, or } from "drizzle-orm";
import { getAnthropic } from "@/lib/anthropic";
import { checkAiRateLimit } from "@/lib/rate-limit";
import { normalizeMaterialRole } from "@/lib/material-roles";
import { readJson } from "@/lib/api-utils";
import { MODELS } from "@/lib/models";
import { parseAiJson } from "@/lib/parse-ai-json";
import { ownedMaterials } from "@/lib/material-scope";
import { loadYearPlanReference } from "@/lib/year-plan-reference";
import {
  templateToPromptSchema,
  coerceToTemplate,
  type TemplateField,
} from "@/lib/lesson-template";


const VALID_COVERAGE_TYPES = new Set([
  "introduces",
  "teaches",
  "reinforces",
  "assesses",
]);

export const maxDuration = 300; // Allow up to 5 minutes (capped to the plan max)

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
    referenceText?: string; // optional pacing guide / class schedule
    rebuild?: boolean; // explicit "replace this quarter's build" opt-in
  }>(req);
  if (!reqBody) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { grade, quarter } = reqBody;
  // Re-running Build on a quarter is a no-op by default (see the guard below);
  // rebuild:true means "throw away this quarter's units and build them again."
  const rebuild = reqBody.rebuild === true;

  if (
    typeof grade !== "number" ||
    !grade ||
    typeof quarter !== "string" ||
    !quarter ||
    quarter.length > 10
  ) {
    return Response.json({ error: "grade and quarter required" }, { status: 400 });
  }

  // Optional reference material (pacing guide, schedule) the teacher pastes to
  // inform pacing/ordering/standards. Capped to keep the prompt bounded.
  const referenceText =
    typeof reqBody.referenceText === "string" ? reqBody.referenceText.slice(0, 10_000).trim() : "";

  // ── 0. Early idempotency short-circuit (#611) ───
  // The authoritative guard lives after course find-or-create (step 5), but the
  // expensive AI call happens in step 3 — a re-Build on an already-built quarter
  // used to spend a full model call (up to minutes of wall clock) just to be
  // refused. Cheaply pre-check with the same course-identity predicate step 4
  // uses; step 5 stays as the race-safe backstop.
  if (!rebuild) {
    const [earlyYear] = await db
      .select({ id: schoolYears.id })
      .from(schoolYears)
      .where(eq(schoolYears.isCurrent, true))
      .limit(1);
    const [existingCourse] = await db
      .select({ id: courses.id })
      .from(courses)
      .where(
        and(
          eq(courses.grade, grade),
          eq(courses.subject, "ELA"),
          earlyYear?.id ? eq(courses.schoolYearId, earlyYear.id) : isNull(courses.schoolYearId),
          eq(courses.ownerEmail, ownerEmail),
        ),
      )
      .limit(1);
    if (existingCourse) {
      const builtUnits = await db
        .select({ id: units.id })
        .from(units)
        .where(and(eq(units.courseId, existingCourse.id), eq(units.quarter, quarter)));
      if (builtUnits.length > 0) {
        return Response.json({
          alreadyBuilt: true,
          courseId: existingCourse.id,
          quarter,
          unitCount: builtUnits.length,
        });
      }
    }
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
    .where(and(inArray(materials.driveFolderId, folderDriveIds), ownedMaterials(ownerEmail)));

  if (quarterMaterials.length === 0) {
    return Response.json({
      error: "No materials found in this quarter. Import files first.",
    }, { status: 400 });
  }

  // ── 1b. Faithful mode: if the teacher's own unit grouping was captured at
  // import (materials.sourceUnit), build units FROM her folders and let the AI
  // only fill the gaps (lessons/standards/durations). If no material carries a
  // sourceUnit (legacy imports), fall back to AI-invented grouping. ──
  const distinctUnits: string[] = [];
  const seenUnit = new Set<string>();
  const materialsByUnit = new Map<string, typeof quarterMaterials>();
  const unassignedMaterials: typeof quarterMaterials = [];
  for (const m of quarterMaterials) {
    const su = m.sourceUnit?.trim();
    if (su) {
      const key = su.toLowerCase();
      if (!seenUnit.has(key)) {
        seenUnit.add(key);
        distinctUnits.push(su);
        materialsByUnit.set(key, []);
      }
      materialsByUnit.get(key)!.push(m);
    } else {
      unassignedMaterials.push(m);
    }
  }
  const faithful = distinctUnits.length > 0;

  // ── 2. Load standards for this grade ───
  const gradeStandards = await db
    .select({ id: standards.id, description: standards.description })
    .from(standards)
    .where(eq(standards.grade, grade))
    .orderBy(asc(standards.id));

  // ── 3. Build AI prompt (mode-aware) ───
  const describeMaterial = (m: (typeof quarterMaterials)[number]) => {
    const cat = driveIdToCategory.get(m.driveFolderId ?? "") ?? "unknown";
    return `- "${m.title}" (type: ${m.materialType}, folder: ${cat})`;
  };
  const standardsList = gradeStandards
    .map((s) => `${s.id}: ${s.description}`)
    .join("\n");

  // The grade's year plan — her own document, imported once into
  // grade_N_YearPlan and re-read on every build. It's the only input that
  // knows what the WHOLE year looks like, so it's the one thing that can tell
  // the model this quarter has three units and not seven (the verified
  // over-splitting failure mode). Degrades to "" and changes nothing when she
  // hasn't imported one.
  const yearPlanText = await loadYearPlanReference(req, ownerEmail, grade);
  const yearPlanBlock = yearPlanText
    ? `\n\nTHE TEACHER'S YEAR PLAN for Grade ${grade} (her own document — authoritative for the shape of the year):
${yearPlanText}

Treat the year plan as binding wherever it speaks to ${quarter}: use ITS unit count, unit names, sequence,
and pacing rather than inventing your own. Where it is silent, fall back to the materials below.`
    : "";

  const referenceBlock = referenceText
    ? `\n\nTeacher's reference material (pacing guide / schedule). Use it to inform pacing, ordering, and standards coverage:\n${referenceText}`
    : "";

  // The teacher's own lesson shape (#647). When she hasn't defined one, this
  // stays null and the prompt keeps its original "activities" list — the
  // Classic shape every pre-template lesson already has, so nothing about
  // import changes for a teacher who never visits /templates.
  const [defaultTemplate] = await db
    .select({ id: lessonTemplates.id, fields: lessonTemplates.fields })
    .from(lessonTemplates)
    .where(and(eq(lessonTemplates.ownerEmail, ownerEmail), eq(lessonTemplates.isDefault, true)))
    .limit(1);
  const templateFields: TemplateField[] | null = defaultTemplate
    ? ((defaultTemplate.fields as TemplateField[]) ?? null)
    : null;
  // Ask the model to fill her fields instead of ours.
  const lessonShapeLine = templateFields
    ? `"plan": ${templateToPromptSchema(templateFields)},`
    : `"activities": ["activity 1", "activity 2"],`;

  // Shared lesson/standard/material rules used in both modes.
  const sharedRules = `- Generate 15-25 lessons TOTAL across the whole quarter (NOT per unit). Size each unit to its
  scope: a full novel ~6-10 lessons, a short/intro unit ~2-4. Do not exceed 25 lessons total.
- Units are NOT equal length. Set each unit's durationWeeks to reflect its real scope — a major
  novel spans several weeks, a short unit only 1-2 — and give it a lesson count to match.
- Keep lesson objectives concise (1-3), and each lesson-plan section brief.
- lessons[].sortOrder restarts at 1 within EACH unit.
- Every material must be linked to at least one lesson in the unit it belongs to.
- materials[].title must exactly match one of the provided filenames.
- standards[].id must be from the provided standards list.
- coverageType: "introduces" | "teaches" | "reinforces" | "assesses"
- role: "primary" | "supporting" | "teacher_reference"
- unitStandards: all unique standards covered across that unit's lessons`;

  const jsonShape = `{
  "units": [
    {
      "title": "Unit title",
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
          ${lessonShapeLine}
          "standards": [{"id": "7.RL.1.A", "coverageType": "teaches"}],
          "materials": [{"title": "exact filename.docx", "role": "primary"}]
        }
      ],
      "unitStandards": ["7.RL.1.A", "7.RL.2.B"]
    }
  ]
}`;

  let systemPrompt: string;
  let userContent: string;

  if (faithful) {
    // The teacher already grouped her files into units. Preserve that grouping
    // exactly; the AI's job is enrichment (lessons/standards/durations) only.
    const unitBlocks = distinctUnits
      .map((name, i) => {
        const mats = materialsByUnit.get(name.toLowerCase()) ?? [];
        return `Unit ${i + 1}: "${name}"\n${mats.map(describeMaterial).join("\n") || "  (no files)"}`;
      })
      .join("\n\n");
    const unassignedBlock =
      unassignedMaterials.length > 0
        ? `\n\nUnassigned materials (not in a unit folder — attach each to the unit where it best fits):\n${unassignedMaterials.map(describeMaterial).join("\n")}`
        : "";

    systemPrompt = `You are enriching a teacher's EXISTING unit structure for ONE quarter. The units and their
titles are FIXED and given to you. Do NOT add, remove, rename, merge, split, or reorder units —
return exactly the given units, in the given order, with titles copied verbatim.

For EACH given unit, produce enrichment: a summary, essential questions, anchor texts, content
warnings, its lessons, and the standards each lesson covers.

Return ONLY valid JSON (no markdown fencing) with this structure:
${jsonShape}

Rules:
- Return one object per given unit, "title" copied EXACTLY from the given unit title.
${sharedRules}`;

    userContent = `Grade ${grade} English, ${quarter}. The teacher organized these materials into the following
units (FIXED — enrich each, do not change the set):

${unitBlocks}${unassignedBlock}

Available standards for Grade ${grade}:
${standardsList}${yearPlanBlock}${referenceBlock}`;
  } else {
    // Legacy path: no captured unit structure, so the AI groups the materials.
    const materialList = quarterMaterials.map(describeMaterial).join("\n");
    systemPrompt = `You are building a curriculum for ONE quarter from a set of teaching materials (files).
A quarter contains ONE OR MORE units — usually one unit per novel or major topic. Analyze the
file names, types, and folder categories, and GROUP the materials into distinct units.

Return ONLY valid JSON (no markdown fencing) with this structure:
${jsonShape}

Rules:
- Group the materials into 1-4 units per quarter — usually one unit per novel or major topic.
  A small topic (e.g. a 1-2 week media-literacy or intro unit) can be its own short unit.
- Order the units array in a sensible teaching sequence for the quarter.
${sharedRules}`;

    userContent = `Build a Grade ${grade} English ${quarter} unit from these materials:

Materials (${quarterMaterials.length} files):
${materialList}

Available standards for Grade ${grade}:
${standardsList}${yearPlanBlock}${referenceBlock}`;
  }

  // Stream the response. A quarter with a large novel (e.g. Roll of Thunder,
  // 40+ materials) needs more than the non-streaming create() call can produce:
  // raising its max_tokens past ~16k trips the SDK's ">10 min, must stream" guard,
  // and 16k itself truncates the JSON for big quarters (→ empty units). Streaming
  // lifts both limits — no guard, and room for the full enrichment. We still
  // accumulate the whole message server-side and parse it exactly as before.
  const stream = getAnthropic().messages.stream({
    model: MODELS.structured,
    max_tokens: 32000,
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
  });
  const message = await stream.finalMessage();

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
      // Present only when the teacher has a template; keyed by her field keys.
      plan?: unknown;
      standards: Array<{ id: string; coverageType: string }>;
      materials: Array<{ title: string; role: string }>;
    }>;
    unitStandards: string[];
  };
  let parsed: { units: ParsedUnit[] } = { units: [] };

  const parseResult = parseAiJson<{ units: ParsedUnit[] }>(text);
  if (parseResult !== null) {
    parsed = parseResult;
  } else {
    console.error("[build-curriculum] unparseable AI response:", text.substring(0, 500));
    // In faithful mode the teacher's units come from her folders, not the AI, so
    // a parse failure only loses enrichment — proceed instead of failing her build.
    if (!faithful) {
      return Response.json({ error: "Failed to parse AI response" }, { status: 500 });
    }
  }

  const parsedUnits = Array.isArray(parsed.units) ? parsed.units : [];
  if (!faithful && parsedUnits.length === 0) {
    return Response.json(
      { error: "The AI did not return any units for this quarter." },
      { status: 500 },
    );
  }

  // Map AI enrichment back to the teacher's units by title (faithful mode).
  const enrichmentByTitle = new Map<string, ParsedUnit>();
  for (const u of parsedUnits) {
    if (u && typeof u.title === "string") enrichmentByTitle.set(u.title.trim().toLowerCase(), u);
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
        // Keep the pacing guide / schedule with the course for provenance.
        teacherNotes: referenceText || null,
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

  // ── 5. Idempotency guard + starting sort order ───
  // Load the course's existing units so we can (a) refuse to silently duplicate
  // a quarter that's already been built, and (b) append new units after any that
  // remain in OTHER quarters.
  const existingUnits = await db
    .select({ id: units.id, sortOrder: units.sortOrder, quarter: units.quarter })
    .from(units)
    .where(eq(units.courseId, courseId))
    .orderBy(asc(units.sortOrder));

  const unitsThisQuarter = existingUnits.filter((u) => u.quarter === quarter);

  // A second Build on an already-built quarter used to append a whole duplicate
  // set of units (The Giver twice, etc.). Now it refuses unless the caller
  // explicitly asks to rebuild, and hands back the course so the client can open
  // it in the editor instead.
  if (unitsThisQuarter.length > 0 && !rebuild) {
    return Response.json({
      alreadyBuilt: true,
      courseId,
      quarter,
      unitCount: unitsThisQuarter.length,
    });
  }

  // Explicit rebuild: clear THIS quarter's units first (other quarters untouched),
  // mirroring delete-unit's polymorphic-attachment cleanup before the cascade.
  if (unitsThisQuarter.length > 0 && rebuild) {
    const staleUnitIds = unitsThisQuarter.map((u) => u.id);
    const [staleLessons, staleAssessments] = await Promise.all([
      db.select({ id: lessons.id }).from(lessons).where(inArray(lessons.unitId, staleUnitIds)),
      db
        .select({ id: assessments.id })
        .from(assessments)
        .where(inArray(assessments.unitId, staleUnitIds)),
    ]);
    const staleLessonIds = staleLessons.map((l) => l.id);
    const staleAssessmentIds = staleAssessments.map((a) => a.id);
    await db
      .delete(materialAttachments)
      .where(
        and(
          eq(materialAttachments.attachableType, "unit"),
          inArray(materialAttachments.attachableId, staleUnitIds),
        ),
      );
    if (staleLessonIds.length > 0) {
      await db
        .delete(materialAttachments)
        .where(
          and(
            eq(materialAttachments.attachableType, "lesson"),
            inArray(materialAttachments.attachableId, staleLessonIds),
          ),
        );
    }
    if (staleAssessmentIds.length > 0) {
      await db
        .delete(materialAttachments)
        .where(
          and(
            eq(materialAttachments.attachableType, "assessment"),
            inArray(materialAttachments.attachableId, staleAssessmentIds),
          ),
        );
    }
    await db.delete(units).where(inArray(units.id, staleUnitIds));
  }

  // Append after units in OTHER quarters (this quarter's are either absent or,
  // on rebuild, just cleared above).
  const otherUnits = existingUnits.filter((u) => u.quarter !== quarter);
  const baseSortOrder =
    otherUnits.length > 0 ? Math.max(...otherUnits.map((u) => u.sortOrder)) + 1 : 1;

  const validStdIds = new Set(gradeStandards.map((s) => s.id));
  const materialByTitle = new Map(quarterMaterials.map((m) => [m.title.toLowerCase(), m.id]));

  // The units to create. Faithful mode: one per the teacher's folder (source
  // "human"), enriched by matching AI output on title. Fallback: the AI's own
  // grouping (source "ai"). Both feed one persistence loop below.
  const unitsToCreate: Array<{ title: string; source: "human" | "ai"; enr?: ParsedUnit }> = faithful
    ? distinctUnits.map((name) => ({
        title: name,
        source: "human" as const,
        enr: enrichmentByTitle.get(name.trim().toLowerCase()),
      }))
    : parsedUnits.map((u) => ({ title: u.title, source: "ai" as const, enr: u }));

  // ── 6-8. Create each unit, its standards, lessons, and material links ───
  const createdUnits: Array<{ id: string; title: string }> = [];
  let lessonCount = 0;
  let materialLinkCount = 0;
  let lessonStdCount = 0;
  let standardCount = 0;

  for (let i = 0; i < unitsToCreate.length; i++) {
    const item = unitsToCreate[i];
    const enr = item.enr;

    const [createdUnit] = await db
      .insert(units)
      .values({
        courseId,
        title: item.title,
        sortOrder: baseSortOrder + i,
        quarter,
        durationWeeks: clampWeeks(enr?.durationWeeks),
        summary: enr?.summary || "",
        essentialQuestions: enr?.essentialQuestions || null,
        anchorTexts: enr?.anchorTexts || null,
        contentWarnings: enr?.contentWarnings || null,
        userId: session.user?.id,
        source: item.source,
      })
      .returning({ id: units.id });
    createdUnits.push({ id: createdUnit.id, title: item.title });

    // Unit standards
    const unitStdCodes = (enr?.unitStandards ?? []).filter((s) => validStdIds.has(s));
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

    // Lessons + lesson standards + material attachments — batched (#583).
    // The old shape awaited one round-trip per lesson, per lesson-standard,
    // and per attachment; over the Neon HTTP driver a 10-lesson unit cost
    // ~60 sequential round-trips and was the 504 root cause. Now each unit
    // costs at most three: one lessons insert, one lessonStandards insert,
    // one materialAttachments insert.
    const lessonDatas = enr?.lessons ?? [];
    if (lessonDatas.length > 0) {
      const insertedLessons = await db
        .insert(lessons)
        .values(
          lessonDatas.map((lessonData) => ({
            unitId: createdUnit.id,
            title: lessonData.title,
            sortOrder: lessonData.sortOrder,
            durationMinutes: clampMinutes(lessonData.durationMinutes),
            objectives: lessonData.objectives ?? [],
            templateId: defaultTemplate?.id ?? null,
            lessonPlan: templateFields
              ? coerceToTemplate(lessonData.plan, templateFields)
              : { activities: lessonData.activities ?? [] },
            source: "ai" as const,
          })),
        )
        .returning({ id: lessons.id, sortOrder: lessons.sortOrder });
      lessonCount += lessonDatas.length;

      // Map created ids back to their source rows by sortOrder (unique within
      // a unit) rather than trusting RETURNING row order.
      const lessonIdBySort = new Map(insertedLessons.map((l) => [l.sortOrder, l.id]));

      const stdRows: Array<{ lessonId: string; standardId: string; coverageType: string }> = [];
      const matRows: Array<{
        materialId: string;
        attachableType: string;
        attachableId: string;
        role: string;
        sortOrder: number;
      }> = [];
      for (const lessonData of lessonDatas) {
        const lessonId = lessonIdBySort.get(lessonData.sortOrder);
        if (!lessonId) continue;
        for (const std of lessonData.standards ?? []) {
          if (!validStdIds.has(std.id)) continue;
          const coverageType = std.coverageType || "teaches";
          if (!VALID_COVERAGE_TYPES.has(coverageType)) continue;
          stdRows.push({ lessonId, standardId: std.id, coverageType });
        }
        for (const mat of lessonData.materials ?? []) {
          const materialId = materialByTitle.get(mat.title.toLowerCase());
          if (!materialId) continue;
          matRows.push({
            materialId,
            attachableType: "lesson",
            attachableId: lessonId,
            role: normalizeMaterialRole(mat.role),
            sortOrder: 0,
          });
        }
      }
      if (stdRows.length > 0) {
        await db.insert(lessonStandards).values(stdRows).onConflictDoNothing();
        lessonStdCount += stdRows.length;
      }
      if (matRows.length > 0) {
        await db.insert(materialAttachments).values(matRows).onConflictDoNothing();
        materialLinkCount += matRows.length;
      }
    }
  }

  return Response.json({
    courseId,
    // "faithful" = units came from the teacher's own folders; "ai" = grouped by AI.
    mode: faithful ? "faithful" : "ai",
    // Whether her year plan steered this build — so the UI can say so instead
    // of leaving her to guess what the model was told.
    yearPlanUsed: yearPlanText.length > 0,
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
