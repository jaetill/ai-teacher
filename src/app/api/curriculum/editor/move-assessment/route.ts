// POST /api/curriculum/editor/move-assessment
// Moves an assessment from one unit to another and adjusts sort orders.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { assessments, units } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { logEdit } from "../log-edit";
import { assertCourseOwnership } from "../assert-ownership";
import type { MoveAssessmentPayload } from "@/types/curriculum-editor";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body: MoveAssessmentPayload = await req.json();
  const { assessmentId, fromUnitId, toUnitId, newSortOrder } = body;

  const [assessment] = await db
    .select()
    .from(assessments)
    .where(eq(assessments.id, assessmentId))
    .limit(1);

  if (!assessment) {
    return Response.json({ error: "Assessment not found" }, { status: 404 });
  }

  const [unit] = await db
    .select({ courseId: units.courseId })
    .from(units)
    .where(eq(units.id, fromUnitId))
    .limit(1);

  if (!unit) {
    return Response.json({ error: "Unit not found" }, { status: 404 });
  }

  const forbidden = await assertCourseOwnership(unit.courseId, session.user?.email);
  if (forbidden) return forbidden;

  // Close gap in source unit
  await db.execute(
    sql`UPDATE assessments SET sort_order = sort_order - 1, updated_at = now() WHERE unit_id = ${fromUnitId} AND sort_order > ${assessment.sortOrder}`
  );

  // Make room in target unit
  await db.execute(
    sql`UPDATE assessments SET sort_order = sort_order + 1, updated_at = now() WHERE unit_id = ${toUnitId} AND sort_order >= ${newSortOrder}`
  );

  // Move the assessment
  await db
    .update(assessments)
    .set({ unitId: toUnitId, sortOrder: newSortOrder, updatedAt: new Date() })
    .where(eq(assessments.id, assessmentId));

  await logEdit({
    courseId: unit.courseId,
    action: "move_assessment",
    entityType: "assessment",
    entityId: assessmentId,
    previousValue: { unitId: fromUnitId, sortOrder: assessment.sortOrder },
    newValue: { unitId: toUnitId, sortOrder: newSortOrder },
  });

  return Response.json({ ok: true });
}
