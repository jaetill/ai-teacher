// POST /api/curriculum/editor/delete-lesson
// Deletes a lesson. Its polymorphic material_attachments have no FK, so they
// are cleared explicitly; lesson_standards cascade on the lesson delete.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { units, lessons, materialAttachments } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { logEdit } from "../log-edit";
import { assertCourseOwnership } from "../assert-ownership";
import { readJson, isUuid } from "@/lib/api-utils";
import { apiError } from "@/lib/error-log";

const ROUTE = "/api/curriculum/editor/delete-lesson";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await readJson<{ lessonId: string }>(req);
  if (!body) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { lessonId } = body;
  if (!isUuid(lessonId)) {
    return Response.json({ error: "Invalid lessonId" }, { status: 400 });
  }

  const [lesson] = await db
    .select({ unitId: lessons.unitId, title: lessons.title })
    .from(lessons)
    .where(eq(lessons.id, lessonId))
    .limit(1);
  if (!lesson) {
    return Response.json({ error: "Lesson not found" }, { status: 404 });
  }

  const [unit] = await db
    .select({ courseId: units.courseId })
    .from(units)
    .where(eq(units.id, lesson.unitId))
    .limit(1);
  if (!unit) {
    return Response.json({ error: "Unit not found" }, { status: 404 });
  }

  const forbidden = await assertCourseOwnership(unit.courseId, session.user?.email);
  if (forbidden) return forbidden;

  try {
    await db.batch([
      db
        .delete(materialAttachments)
        .where(
          and(
            eq(materialAttachments.attachableType, "lesson"),
            eq(materialAttachments.attachableId, lessonId),
          ),
        ),
      db.delete(lessons).where(eq(lessons.id, lessonId)),
    ]);
  } catch (err) {
    return apiError(ROUTE, 500, "write_failed", "Failed to delete lesson", { cause: err });
  }

  try {
    await logEdit({
      courseId: unit.courseId,
      action: "delete_lesson",
      entityType: "lesson",
      entityId: lessonId,
      previousValue: { title: lesson.title },
    });
  } catch (err) {
    console.error("[delete-lesson] logEdit failed:", err);
  }

  return Response.json({ ok: true });
}
