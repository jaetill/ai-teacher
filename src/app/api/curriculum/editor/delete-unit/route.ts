// POST /api/curriculum/editor/delete-unit
// Deletes a unit and its lessons/assessments. Because material_attachments are
// polymorphic (no FK to the target), their rows for the unit and each of its
// lessons/assessments must be cleared explicitly before the cascade.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { units, lessons, assessments, materialAttachments } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { logEdit } from "../log-edit";
import { assertCourseOwnership } from "../assert-ownership";
import { readJson, isUuid } from "@/lib/api-utils";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await readJson<{ unitId: string }>(req);
  if (!body) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { unitId } = body;
  if (!isUuid(unitId)) {
    return Response.json({ error: "Invalid unitId" }, { status: 400 });
  }

  const [unit] = await db
    .select({ courseId: units.courseId, title: units.title })
    .from(units)
    .where(eq(units.id, unitId))
    .limit(1);
  if (!unit) {
    return Response.json({ error: "Unit not found" }, { status: 404 });
  }

  const forbidden = await assertCourseOwnership(unit.courseId, session.user?.email);
  if (forbidden) return forbidden;

  // Gather child ids so we can clear their polymorphic material attachments.
  const childLessons = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(eq(lessons.unitId, unitId));
  const childAssessments = await db
    .select({ id: assessments.id })
    .from(assessments)
    .where(eq(assessments.unitId, unitId));
  const lessonIds = childLessons.map((l) => l.id);
  const assessmentIds = childAssessments.map((a) => a.id);

  try {
    const stmts = [
      // Attachments on the unit itself.
      db
        .delete(materialAttachments)
        .where(
          and(
            eq(materialAttachments.attachableType, "unit"),
            eq(materialAttachments.attachableId, unitId),
          ),
        ),
      // Attachments on the unit's lessons.
      ...(lessonIds.length > 0
        ? [
            db
              .delete(materialAttachments)
              .where(
                and(
                  eq(materialAttachments.attachableType, "lesson"),
                  inArray(materialAttachments.attachableId, lessonIds),
                ),
              ),
          ]
        : []),
      // Attachments on the unit's assessments.
      ...(assessmentIds.length > 0
        ? [
            db
              .delete(materialAttachments)
              .where(
                and(
                  eq(materialAttachments.attachableType, "assessment"),
                  inArray(materialAttachments.attachableId, assessmentIds),
                ),
              ),
          ]
        : []),
      // The unit delete cascades to lessons, assessments, and their standards.
      db.delete(units).where(eq(units.id, unitId)),
    ];
    await db.batch(stmts as [(typeof stmts)[number], ...(typeof stmts)[number][]]);
  } catch (err) {
    console.error("[delete-unit] transaction failed", err);
    return Response.json({ error: "Failed to delete unit" }, { status: 500 });
  }

  try {
    await logEdit({
      courseId: unit.courseId,
      action: "delete_unit",
      entityType: "unit",
      entityId: unitId,
      previousValue: { title: unit.title },
    });
  } catch (err) {
    console.error("[delete-unit] logEdit failed:", err);
  }

  return Response.json({ ok: true });
}
