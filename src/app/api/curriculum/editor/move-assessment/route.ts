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
import { readJson, isUuid } from "@/lib/api-utils";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await readJson<MoveAssessmentPayload>(req);
  if (!body) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { assessmentId, fromUnitId, toUnitId, newSortOrder } = body;

  // Validate before Postgres does: a non-UUID id or non-integer sort order
  // throws an uncaught driver error → 500 (#eval-2026-07).
  if (!isUuid(assessmentId) || !isUuid(fromUnitId) || !isUuid(toUnitId)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }
  if (!Number.isInteger(newSortOrder) || newSortOrder < 1 || newSortOrder > 10_000) {
    return Response.json({ error: "Invalid newSortOrder" }, { status: 400 });
  }

  const [assessment] = await db
    .select()
    .from(assessments)
    .where(eq(assessments.id, assessmentId))
    .limit(1);

  if (!assessment) {
    return Response.json({ error: "Assessment not found" }, { status: 404 });
  }

  if (assessment.unitId !== fromUnitId) {
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
        .update(assessments)
        .set({ sortOrder: sql<number>`${assessments.sortOrder} - 1`, updatedAt: new Date() })
        .where(and(eq(assessments.unitId, fromUnitId), gt(assessments.sortOrder, assessment.sortOrder))),
      // Make room in the target unit
      db
        .update(assessments)
        .set({ sortOrder: sql<number>`${assessments.sortOrder} + 1`, updatedAt: new Date() })
        .where(and(eq(assessments.unitId, toUnitId), gte(assessments.sortOrder, newSortOrder))),
      // Move the assessment
      db
        .update(assessments)
        .set({ unitId: toUnitId, sortOrder: newSortOrder, updatedAt: new Date() })
        .where(eq(assessments.id, assessmentId)),
    ]);
  } catch (err) {
    console.error("[move-assessment] transaction failed", err);
    return Response.json({ error: "Failed to move assessment" }, { status: 500 });
  }

  try {
    await logEdit({
      courseId: fromUnit.courseId,
      action: "move_assessment",
      entityType: "assessment",
      entityId: assessmentId,
      previousValue: { unitId: fromUnitId, sortOrder: assessment.sortOrder },
      newValue: { unitId: toUnitId, sortOrder: newSortOrder },
    });
  } catch (err) {
    console.error("[move-assessment] logEdit failed:", err);
  }

  return Response.json({ ok: true });
}
