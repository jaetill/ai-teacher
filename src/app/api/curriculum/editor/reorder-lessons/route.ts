// POST /api/curriculum/editor/reorder-lessons
// Reorders lessons within a unit by updating sortOrder based on array position.

import { db } from "@/db";
import { lessons, units } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { logEdit } from "../log-edit";
import type { ReorderLessonsPayload } from "@/types/curriculum-editor";

export async function POST(req: Request) {
  const body: ReorderLessonsPayload = await req.json();
  const { unitId, lessonIds } = body;

  // Get current state for logging
  const currentLessons = await db
    .select({ id: lessons.id, sortOrder: lessons.sortOrder })
    .from(lessons)
    .where(eq(lessons.unitId, unitId));

  const previousOrder = currentLessons
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((l) => l.id);

  // Get courseId for logging
  const [unit] = await db
    .select({ courseId: units.courseId })
    .from(units)
    .where(eq(units.id, unitId))
    .limit(1);

  if (!unit) {
    return Response.json({ error: "Unit not found" }, { status: 404 });
  }

  // Update sort orders
  for (let i = 0; i < lessonIds.length; i++) {
    await db
      .update(lessons)
      .set({ sortOrder: i + 1, updatedAt: new Date() })
      .where(eq(lessons.id, lessonIds[i]));
  }

  await logEdit({
    courseId: unit.courseId,
    action: "reorder_lesson",
    entityType: "unit",
    entityId: unitId,
    previousValue: { order: previousOrder },
    newValue: { order: lessonIds },
  });

  return Response.json({ ok: true });
}
