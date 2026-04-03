// POST /api/curriculum/editor/retype-content
// Converts a lesson to an assessment or vice versa.
// This is a delete+insert operation that preserves material attachments.

import { db } from "@/db";
import { lessons, assessments, units, materialAttachments } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { logEdit } from "../log-edit";
import type { RetypeContentPayload } from "@/types/curriculum-editor";

export async function POST(req: Request) {
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

    // Insert as assessment
    const [newAssessment] = await db.insert(assessments).values({
      unitId: lesson.unitId,
      title: lesson.title,
      assessmentType: "formative",
      sortOrder: lesson.sortOrder,
      source: lesson.source,
    }).returning({ id: assessments.id });

    // Update material attachments to point to new assessment
    await db
      .update(materialAttachments)
      .set({ attachableType: "assessment", attachableId: newAssessment.id })
      .where(
        and(
          eq(materialAttachments.attachableType, "lesson"),
          eq(materialAttachments.attachableId, entityId)
        )
      );

    // Delete the lesson
    await db.delete(lessons).where(eq(lessons.id, entityId));

    await logEdit({
      courseId: unit!.courseId,
      action: "retype_content",
      entityType: "lesson",
      entityId,
      previousValue: { type: "lesson", title: lesson.title },
      newValue: { type: "assessment", id: newAssessment.id, assessmentType: "formative" },
    });

    return Response.json({ ok: true, newId: newAssessment.id });
  }

  if (entityType === "assessment" && newType === "lesson") {
    // Assessment → Lesson
    const [assessment] = await db.select().from(assessments).where(eq(assessments.id, entityId)).limit(1);
    if (!assessment) return Response.json({ error: "Assessment not found" }, { status: 404 });

    const [unit] = await db.select({ courseId: units.courseId }).from(units).where(eq(units.id, assessment.unitId)).limit(1);

    // Insert as lesson
    const [newLesson] = await db.insert(lessons).values({
      unitId: assessment.unitId,
      title: assessment.title,
      sortOrder: assessment.sortOrder,
      source: assessment.source,
    }).returning({ id: lessons.id });

    // Update material attachments
    await db
      .update(materialAttachments)
      .set({ attachableType: "lesson", attachableId: newLesson.id })
      .where(
        and(
          eq(materialAttachments.attachableType, "assessment"),
          eq(materialAttachments.attachableId, entityId)
        )
      );

    // Delete the assessment
    await db.delete(assessments).where(eq(assessments.id, entityId));

    await logEdit({
      courseId: unit!.courseId,
      action: "retype_content",
      entityType: "assessment",
      entityId,
      previousValue: { type: "assessment", title: assessment.title, assessmentType: assessment.assessmentType },
      newValue: { type: "lesson", id: newLesson.id },
    });

    return Response.json({ ok: true, newId: newLesson.id });
  }

  return Response.json({ error: "Invalid conversion" }, { status: 400 });
}
