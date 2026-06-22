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

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body: RetypeContentPayload = await req.json();
  const { entityType, entityId, newType } = body;

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

    let newAssessmentId: string;
    try {
      const result = await db.transaction(async (tx) => {
        const [newAssessment] = await tx.insert(assessments).values({
          unitId: lesson.unitId,
          title: lesson.title,
          assessmentType: "formative",
          sortOrder: lesson.sortOrder,
          source: lesson.source,
        }).returning({ id: assessments.id });

        await tx
          .update(materialAttachments)
          .set({ attachableType: "assessment", attachableId: newAssessment.id })
          .where(
            and(
              eq(materialAttachments.attachableType, "lesson"),
              eq(materialAttachments.attachableId, entityId)
            )
          );

        await tx.delete(lessons).where(eq(lessons.id, entityId));

        return newAssessment.id;
      });
      newAssessmentId = result;
    } catch (err) {
      console.error("[retype-content] transaction failed", err);
      return Response.json({ error: "Failed to retype content" }, { status: 500 });
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

    let newLessonId: string;
    try {
      const result = await db.transaction(async (tx) => {
        const [newLesson] = await tx.insert(lessons).values({
          unitId: assessment.unitId,
          title: assessment.title,
          sortOrder: assessment.sortOrder,
          source: assessment.source,
        }).returning({ id: lessons.id });

        await tx
          .update(materialAttachments)
          .set({ attachableType: "lesson", attachableId: newLesson.id })
          .where(
            and(
              eq(materialAttachments.attachableType, "assessment"),
              eq(materialAttachments.attachableId, entityId)
            )
          );

        await tx.delete(assessments).where(eq(assessments.id, entityId));

        return newLesson.id;
      });
      newLessonId = result;
    } catch (err) {
      console.error("[retype-content] transaction failed", err);
      return Response.json({ error: "Failed to retype content" }, { status: 500 });
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
