// POST /api/curriculum/editor/create-unit
// Adds a new empty unit to a course (teacher-authored, appended to the end).

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { units } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { logEdit } from "../log-edit";
import { assertCourseOwnership } from "../assert-ownership";
import { readJson, isUuid } from "@/lib/api-utils";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await readJson<{ courseId: string; title?: string; quarter?: string }>(req);
  if (!body) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { courseId } = body;
  if (!isUuid(courseId)) {
    return Response.json({ error: "Invalid courseId" }, { status: 400 });
  }

  const forbidden = await assertCourseOwnership(courseId, session.user?.email);
  if (forbidden) return forbidden;

  const title =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim().slice(0, 500)
      : "New Unit";
  const quarter =
    typeof body.quarter === "string" && body.quarter.length <= 10 ? body.quarter : null;

  // Append after existing units.
  const existing = await db
    .select({ sortOrder: units.sortOrder })
    .from(units)
    .where(eq(units.courseId, courseId))
    .orderBy(asc(units.sortOrder));
  const sortOrder = existing.length > 0 ? Math.max(...existing.map((u) => u.sortOrder)) + 1 : 1;

  const [created] = await db
    .insert(units)
    .values({
      courseId,
      title,
      sortOrder,
      quarter,
      durationWeeks: 1,
      summary: "",
      userId: session.user?.id,
      source: "human",
    })
    .returning({ id: units.id });

  try {
    await logEdit({
      courseId,
      action: "create_unit",
      entityType: "unit",
      entityId: created.id,
      newValue: { title, sortOrder },
    });
  } catch (err) {
    console.error("[create-unit] logEdit failed:", err);
  }

  return Response.json({ ok: true, unitId: created.id });
}
