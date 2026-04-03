// POST /api/curriculum/editor/attach-material
// Creates a new material attachment.

import { db } from "@/db";
import { materialAttachments, units, lessons, assessments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logEdit } from "../log-edit";
import type { AttachMaterialPayload } from "@/types/curriculum-editor";

export async function POST(req: Request) {
  const body: AttachMaterialPayload = await req.json();
  const { materialId, attachableType, attachableId, role = "supporting" } = body;

  // Resolve courseId
  let courseId: string;
  if (attachableType === "unit") {
    const [unit] = await db.select({ courseId: units.courseId }).from(units).where(eq(units.id, attachableId)).limit(1);
    if (!unit) return Response.json({ error: "Unit not found" }, { status: 404 });
    courseId = unit.courseId;
  } else if (attachableType === "lesson") {
    const [lesson] = await db.select({ unitId: lessons.unitId }).from(lessons).where(eq(lessons.id, attachableId)).limit(1);
    if (!lesson) return Response.json({ error: "Lesson not found" }, { status: 404 });
    const [unit] = await db.select({ courseId: units.courseId }).from(units).where(eq(units.id, lesson.unitId)).limit(1);
    courseId = unit!.courseId;
  } else {
    const [assessment] = await db.select({ unitId: assessments.unitId }).from(assessments).where(eq(assessments.id, attachableId)).limit(1);
    if (!assessment) return Response.json({ error: "Assessment not found" }, { status: 404 });
    const [unit] = await db.select({ courseId: units.courseId }).from(units).where(eq(units.id, assessment.unitId)).limit(1);
    courseId = unit!.courseId;
  }

  const [attachment] = await db.insert(materialAttachments).values({
    materialId,
    attachableType,
    attachableId,
    role,
  }).returning({ id: materialAttachments.id });

  await logEdit({
    courseId,
    action: "attach_material",
    entityType: "material",
    entityId: materialId,
    previousValue: null,
    newValue: { attachableType, attachableId, role },
  });

  return Response.json({ ok: true, attachmentId: attachment.id });
}
