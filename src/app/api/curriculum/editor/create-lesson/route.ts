// POST /api/curriculum/editor/create-lesson
// Adds a new empty lesson to a unit (teacher-authored, appended to the end).

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { units, lessons } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { logEdit } from "../log-edit";
import { assertCourseOwnership } from "../assert-ownership";
import { readJson, isUuid } from "@/lib/api-utils";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await readJson<{ unitId: string; title?: string }>(req);
  if (!body) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { unitId } = body;
  if (!isUuid(unitId)) {
    return Response.json({ error: "Invalid unitId" }, { status: 400 });
  }

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

  const title =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim().slice(0, 500)
      : "New Lesson";

  // Append after existing lessons in this unit.
  const existing = await db
    .select({ sortOrder: lessons.sortOrder })
    .from(lessons)
    .where(eq(lessons.unitId, unitId))
    .orderBy(asc(lessons.sortOrder));
  const sortOrder = existing.length > 0 ? Math.max(...existing.map((l) => l.sortOrder)) + 1 : 1;

  const [created] = await db
    .insert(lessons)
    .values({
      unitId,
      title,
      sortOrder,
      objectives: [],
      lessonPlan: {},
      source: "human",
    })
    .returning({ id: lessons.id });

  try {
    await logEdit({
      courseId: unit.courseId,
      action: "create_lesson",
      entityType: "lesson",
      entityId: created.id,
      newValue: { title, sortOrder },
    });
  } catch (err) {
    console.error("[create-lesson] logEdit failed:", err);
  }

  return Response.json({ ok: true, lessonId: created.id });
}
