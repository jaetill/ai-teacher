// POST /api/units/[id]/link-materials
// Uses Claude to infer which materials in the unit's Drive folders
// belong to which lessons, then persists via materialAttachments.
// Materials must already be in the materials table (via bulk upload).

import { db } from "@/db";
import {
  units,
  lessons,
  materials,
  materialAttachments,
  driveFolders,
  courses,
} from "@/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // ── Load unit, course, and lessons ───
  const [unit] = await db.select().from(units).where(eq(units.id, id)).limit(1);
  if (!unit) {
    return Response.json({ error: "Unit not found" }, { status: 404 });
  }

  const [course] = await db
    .select({ grade: courses.grade })
    .from(courses)
    .where(eq(courses.id, unit.courseId))
    .limit(1);

  const unitLessons = await db
    .select({ id: lessons.id, title: lessons.title, sortOrder: lessons.sortOrder })
    .from(lessons)
    .where(eq(lessons.unitId, id))
    .orderBy(asc(lessons.sortOrder));

  if (!course || unitLessons.length === 0) {
    return Response.json({ error: "No course or lessons found" }, { status: 400 });
  }

  // ── Find materials in this unit's quarter folders ───
  const quarter = unit.quarter ?? `Q${Math.ceil(unit.sortOrder / 2)}`;
  const folderCategories = ["Curriculum", "Lessons", "Activities", "Assessments", "Resources"];
  const folderKeys = folderCategories.map(
    (c) => `grade_${course.grade}_${quarter}_${c}`
  );

  const folders = await db
    .select({ folderKey: driveFolders.folderKey, driveId: driveFolders.driveId })
    .from(driveFolders)
    .where(inArray(driveFolders.folderKey, folderKeys));

  const folderDriveIds = folders.map((f) => f.driveId);

  if (folderDriveIds.length === 0) {
    return Response.json({ error: "No Drive folders found" }, { status: 400 });
  }

  const quarterMaterials = await db
    .select({
      id: materials.id,
      title: materials.title,
      materialType: materials.materialType,
      driveWebUrl: materials.driveWebUrl,
      driveFolderId: materials.driveFolderId,
    })
    .from(materials)
    .where(inArray(materials.driveFolderId, folderDriveIds));

  if (quarterMaterials.length === 0) {
    return Response.json({
      error: "No materials found in this quarter's folders. Upload materials first via Bulk Upload.",
    }, { status: 400 });
  }

  // ── Build folder category lookup ───
  const driveIdToCategory = new Map<string, string>();
  for (const f of folders) {
    const cat = f.folderKey.split("_").pop()!;
    driveIdToCategory.set(f.driveId, cat);
  }

  // ── AI inference ───
  const lessonList = unitLessons
    .map((l) => `${l.sortOrder}. "${l.title}"`)
    .join("\n");

  const materialList = quarterMaterials
    .map((m) => {
      const cat = driveIdToCategory.get(m.driveFolderId ?? "") ?? "unknown";
      return `- "${m.title}" (${m.materialType}, folder: ${cat})`;
    })
    .join("\n");

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: `You link teaching materials (files) to the lessons that use them.

For each material, determine which lesson(s) it belongs to based on the filename, material type, and folder category. A material can be linked to multiple lessons if it spans them.

Also assign a role:
- primary: the main resource for that lesson (e.g., the slide deck, the main handout)
- supporting: supplementary material (e.g., answer key, reading passage)
- teacher_reference: for teacher use only (e.g., curriculum overview, notes for improvement)

Some materials may be unit-level (curriculum overviews, timelines) rather than lesson-specific. For those, set lessonSortOrder to 0 to indicate unit-level attachment.

Return ONLY a JSON array:
[{"materialTitle": "...", "links": [{"lessonSortOrder": 4, "role": "primary"}, ...]}, ...]

Every material should have at least one link. No markdown fencing, no explanation.`,
    messages: [
      {
        role: "user",
        content: `Unit: "${unit.title}"

Lessons:
${lessonList}

Materials to link:
${materialList}`,
      },
    ],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";

  let mappings: Array<{
    materialTitle: string;
    links: Array<{ lessonSortOrder: number; role: string }>;
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
  const materialByTitle = new Map(
    quarterMaterials.map((m) => [m.title.toLowerCase(), m.id])
  );
  const lessonBySort = new Map(unitLessons.map((l) => [l.sortOrder, l.id]));
  let inserted = 0;

  for (const m of mappings) {
    const materialId = materialByTitle.get(m.materialTitle.toLowerCase());
    if (!materialId) continue;

    for (const link of m.links) {
      if (link.lessonSortOrder === 0) {
        // Unit-level attachment
        await db
          .insert(materialAttachments)
          .values({
            materialId,
            attachableType: "unit",
            attachableId: id,
            role: link.role || "supporting",
            sortOrder: 0,
          })
          .onConflictDoNothing();
        inserted++;
      } else {
        const lessonId = lessonBySort.get(link.lessonSortOrder);
        if (!lessonId) continue;
        await db
          .insert(materialAttachments)
          .values({
            materialId,
            attachableType: "lesson",
            attachableId: lessonId,
            role: link.role || "supporting",
            sortOrder: 0,
          })
          .onConflictDoNothing();
        inserted++;
      }
    }
  }

  return Response.json({
    message: `Linked ${inserted} material-lesson connections`,
    materialCount: quarterMaterials.length,
    lessonCount: unitLessons.length,
  });
}
