// POST /api/curriculum/editor/retype-content
// Converts a lesson to an assessment or vice versa.
// This is a delete+insert operation that preserves material attachments.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { lessons, assessments, units, materialAttachments } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { logEdit } from "../log-edit";
import { assertCourseOwnership } from "../assert-ownership";
import type { RetypeContentPayload } from "@/types/curriculum-editor";
import { readJson, isUuid } from "@/lib/api-utils";
import { apiError } from "@/lib/error-log";

const ROUTE = "/api/curriculum/editor/retype-content";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await readJson<RetypeContentPayload>(req);
  if (!body) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { entityType, entityId, newType } = body;

  if (
    !isUuid(entityId) ||
    !["lesson", "assessment"].includes(entityType) ||
    !["lesson", "assessment"].includes(newType)
  ) {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (entityType === newType) {
    return Response.json({ error: "Already that type" }, { status: 400 });
  }

  if (entityType === "lesson" && newType === "assessment") {
    // Lesson → Assessment
    const [lesson] = await db.select().from(lessons).where(eq(lessons.id, entityId)).limit(1);
    if (!lesson) return Response.json({ error: "Lesson not found" }, { status: 404 });

    const [unit] = await db.select({ courseId: units.courseId }).from(units).where(eq(units.id, lesson.unitId)).limit(1);
    if (!unit) return Response.json({ error: "Unit not found" }, { status: 404 });

    const forbidden = await assertCourseOwnership(unit.courseId, session.user?.email);
    if (forbidden) return forbidden;

    // neon-http cannot run interactive transactions (db.transaction() throws
    // at runtime — this route 500ed on every request). Generate the new row's
    // id up front so all statements are known and can run as one atomic
    // db.batch(), which neon executes in a single transaction.
    const newAssessmentId = crypto.randomUUID();
    try {
      await db.batch([
        db.insert(assessments).values({
          id: newAssessmentId,
          unitId: lesson.unitId,
          title: lesson.title,
          assessmentType: "formative",
          sortOrder: lesson.sortOrder,
          source: lesson.source,
        }),
        db
          .update(materialAttachments)
          .set({ attachableType: "assessment", attachableId: newAssessmentId })
          .where(
            and(
              eq(materialAttachments.attachableType, "lesson"),
              eq(materialAttachments.attachableId, entityId)
            )
          ),
        db.delete(lessons).where(eq(lessons.id, entityId)),
      ]);
    } catch (err) {
      return apiError(ROUTE, 500, "write_failed", "Failed to retype content", { cause: err });
    }

    try {
      await logEdit({
        courseId: unit.courseId,
        action: "retype_content",
        entityType: "lesson",
        entityId,
        previousValue: { type: "lesson", title: lesson.title },
        newValue: { type: "assessment", id: newAssessmentId, assessmentType: "formative" },
      });
    } catch (err) {
      console.error("[retype-content] logEdit failed:", err);
    }

    return Response.json({ ok: true, newId: newAssessmentId });
  }

  if (entityType === "assessment" && newType === "lesson") {
    // Assessment → Lesson
    const [assessment] = await db.select().from(assessments).where(eq(assessments.id, entityId)).limit(1);
    if (!assessment) return Response.json({ error: "Assessment not found" }, { status: 404 });

    const [unit] = await db.select({ courseId: units.courseId }).from(units).where(eq(units.id, assessment.unitId)).limit(1);
    if (!unit) return Response.json({ error: "Unit not found" }, { status: 404 });

    const forbidden = await assertCourseOwnership(unit.courseId, session.user?.email);
    if (forbidden) return forbidden;

    // Same neon-http constraint as above: pre-generate the id, batch atomically.
    const newLessonId = crypto.randomUUID();
    try {
      await db.batch([
        db.insert(lessons).values({
          id: newLessonId,
          unitId: assessment.unitId,
          title: assessment.title,
          sortOrder: assessment.sortOrder,
          source: assessment.source,
        }),
        db
          .update(materialAttachments)
          .set({ attachableType: "lesson", attachableId: newLessonId })
          .where(
            and(
              eq(materialAttachments.attachableType, "assessment"),
              eq(materialAttachments.attachableId, entityId)
            )
          ),
        db.delete(assessments).where(eq(assessments.id, entityId)),
      ]);
    } catch (err) {
      return apiError(ROUTE, 500, "write_failed", "Failed to retype content", { cause: err });
    }

    try {
      await logEdit({
        courseId: unit.courseId,
        action: "retype_content",
        entityType: "assessment",
        entityId,
        previousValue: { type: "assessment", title: assessment.title, assessmentType: assessment.assessmentType },
        newValue: { type: "lesson", id: newLessonId },
      });
    } catch (err) {
      console.error("[retype-content] logEdit failed:", err);
    }

    return Response.json({ ok: true, newId: newLessonId });
  }

  return Response.json({ error: "Invalid conversion" }, { status: 400 });
}
