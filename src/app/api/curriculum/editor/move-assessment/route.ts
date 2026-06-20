// POST /api/curriculum/editor/move-assessment
// Moves an assessment from one unit to another and adjusts sort orders.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { assessments, units } from "@/db/schema";
import { sql, and, eq, gt, gte } from "drizzle-orm";
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
    .where(and(eq(assessments.id, assessmentId), eq(assessments.unitId, fromUnitId)))
    .limit(1);

  if (!assessment) {
    return Response.json({ error: "Assessment not found" }, { status: 404 });
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

  // Close gap in source unit
  await db
    .update(assessments)
    .set({ sortOrder: sql<number>`${assessments.sortOrder} - 1`, updatedAt: new Date() })
    .where(and(eq(assessments.unitId, fromUnitId), gt(assessments.sortOrder, assessment.sortOrder)));

  // Make room in target unit
  await db
    .update(assessments)
    .set({ sortOrder: sql<number>`${assessments.sortOrder} + 1`, updatedAt: new Date() })
    .where(and(eq(assessments.unitId, toUnitId), gte(assessments.sortOrder, newSortOrder)));

  // Move the assessment
  await db
    .update(assessments)
    .set({ unitId: toUnitId, sortOrder: newSortOrder, updatedAt: new Date() })
    .where(eq(assessments.id, assessmentId));

  await logEdit({
    courseId: fromUnit.courseId,
    action: "move_assessment",
    entityType: "assessment",
    entityId: assessmentId,
    previousValue: { unitId: fromUnitId, sortOrder: assessment.sortOrder },
    newValue: { unitId: toUnitId, sortOrder: newSortOrder },
  });

  return Response.json({ ok: true });
}
