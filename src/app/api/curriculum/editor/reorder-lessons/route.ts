// POST /api/curriculum/editor/reorder-lessons
// Reorders lessons within a unit by updating sortOrder based on array position.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { lessons, units } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { logEdit } from "../log-edit";
import { assertCourseOwnership } from "../assert-ownership";
import type { ReorderLessonsPayload } from "@/types/curriculum-editor";
import { readJson, isUuid } from "@/lib/api-utils";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await readJson<ReorderLessonsPayload>(req);
  if (!body) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { unitId, lessonIds } = body;

  // Validate before Postgres does (#eval-2026-07); the cap bounds the
  // sequential-UPDATE loop below.
  if (!isUuid(unitId)) {
    return Response.json({ error: "Invalid unitId" }, { status: 400 });
  }
  if (
    !Array.isArray(lessonIds) ||
    lessonIds.length === 0 ||
    lessonIds.length > 500 ||
    !lessonIds.every(isUuid)
  ) {
    return Response.json({ error: "Invalid lessonIds" }, { status: 400 });
  }

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

  const forbidden = await assertCourseOwnership(unit.courseId, session.user?.email);
  if (forbidden) return forbidden;

  // Update sort orders in a single atomic batch (one neon transaction) —
  // the previous sequential loop could fail mid-way and leave a unit with
  // inconsistent sort orders.
  const [first, ...rest] = lessonIds.map((lessonId, i) =>
    db
      .update(lessons)
      .set({ sortOrder: i + 1, updatedAt: new Date() })
      .where(and(eq(lessons.id, lessonId), eq(lessons.unitId, unitId)))
  );
  await db.batch([first, ...rest]);

  // Audit-log failure must not turn an already-committed write into a 500.
  try {
    await logEdit({
      courseId: unit.courseId,
      action: "reorder_lesson",
      entityType: "unit",
      entityId: unitId,
      previousValue: { order: previousOrder },
      newValue: { order: lessonIds },
    });
  } catch (err) {
    console.error("[reorder-lessons] logEdit failed:", err);
  }

  return Response.json({ ok: true });
}
