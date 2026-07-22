// POST /api/curriculum/editor/move-lesson
// Moves a lesson from one unit to another and adjusts sort orders.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { lessons, units } from "@/db/schema";
import { sql, and, eq, gt, gte } from "drizzle-orm";
import { logEdit } from "../log-edit";
import { assertCourseOwnership } from "../assert-ownership";
import type { MoveLessonPayload } from "@/types/curriculum-editor";
import { readJson, isUuid } from "@/lib/api-utils";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await readJson<MoveLessonPayload>(req);
  if (!body) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { lessonId, fromUnitId, toUnitId, newSortOrder } = body;

  // Validate before Postgres does: a non-UUID id or non-integer sort order
  // throws an uncaught driver error → 500 (#eval-2026-07).
  if (!isUuid(lessonId) || !isUuid(fromUnitId) || !isUuid(toUnitId)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }
  if (!Number.isInteger(newSortOrder) || newSortOrder < 1 || newSortOrder > 10_000) {
    return Response.json({ error: "Invalid newSortOrder" }, { status: 400 });
  }

  const [lesson] = await db
    .select()
    .from(lessons)
    .where(eq(lessons.id, lessonId))
    .limit(1);

  if (!lesson) {
    return Response.json({ error: "Lesson not found" }, { status: 404 });
  }

  if (lesson.unitId !== fromUnitId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const [fromUnit] = await db
    .select({ courseId: units.courseId })
    .from(units)
    .where(eq(units.id, fromUnitId))
    .limit(1);

  if (!fromUnit) {
    return Response.json({ error: "Unit not found" }, { status: 404 });
  }

  const sourceForbidden = await assertCourseOwnership(fromUnit.courseId, session.user?.email);
  if (sourceForbidden) return sourceForbidden;

  const [toUnit] = await db
    .select({ courseId: units.courseId })
    .from(units)
    .where(eq(units.id, toUnitId))
    .limit(1);

  if (!toUnit) {
    return Response.json({ error: "Destination unit not found" }, { status: 404 });
  }

  const destForbidden = await assertCourseOwnership(toUnit.courseId, session.user?.email);
  if (destForbidden) return destForbidden;

  try {
    // neon-http cannot run interactive transactions (db.transaction() throws
    // "No transactions support in neon-http driver" at runtime — this route
    // 500ed on every request). All statements are known upfront, so send them
    // as one atomic db.batch(), which neon executes in a single transaction.
    await db.batch([
      // Close the gap in the source unit
      db
        .update(lessons)
        .set({ sortOrder: sql<number>`${lessons.sortOrder} - 1`, updatedAt: new Date() })
        .where(and(eq(lessons.unitId, fromUnitId), gt(lessons.sortOrder, lesson.sortOrder))),
      // Make room in the target unit
      db
        .update(lessons)
        .set({ sortOrder: sql<number>`${lessons.sortOrder} + 1`, updatedAt: new Date() })
        .where(and(eq(lessons.unitId, toUnitId), gte(lessons.sortOrder, newSortOrder))),
      // Move the lesson
      db
        .update(lessons)
        .set({ unitId: toUnitId, sortOrder: newSortOrder, updatedAt: new Date() })
        .where(eq(lessons.id, lessonId)),
    ]);
  } catch (err) {
    console.error("[move-lesson] transaction failed", err);
    return Response.json({ error: "Failed to move lesson" }, { status: 500 });
  }

  try {
    await logEdit({
      courseId: fromUnit.courseId,
      action: "move_lesson",
      entityType: "lesson",
      entityId: lessonId,
      previousValue: { unitId: fromUnitId, sortOrder: lesson.sortOrder },
      newValue: { unitId: toUnitId, sortOrder: newSortOrder },
    });
  } catch (err) {
    console.error("[move-lesson] logEdit failed:", err);
  }

  return Response.json({ ok: true });
}
