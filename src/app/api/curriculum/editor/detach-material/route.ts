// POST /api/curriculum/editor/detach-material
// Removes a material attachment (does NOT delete the material itself).

import { db } from "@/db";
import { materialAttachments, materials, units, lessons, assessments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logEdit } from "../log-edit";
import type { DetachMaterialPayload } from "@/types/curriculum-editor";

export async function POST(req: Request) {
  const body: DetachMaterialPayload = await req.json();
  const { materialAttachmentId } = body;

  // Get current attachment for logging
  const [attachment] = await db
    .select()
    .from(materialAttachments)
    .where(eq(materialAttachments.id, materialAttachmentId))
    .limit(1);

  if (!attachment) {
    return Response.json({ error: "Attachment not found" }, { status: 404 });
  }

  // Resolve courseId
  let courseId: string;
  if (attachment.attachableType === "unit") {
    const [unit] = await db.select({ courseId: units.courseId }).from(units).where(eq(units.id, attachment.attachableId)).limit(1);
    courseId = unit!.courseId;
  } else if (attachment.attachableType === "lesson") {
    const [lesson] = await db.select({ unitId: lessons.unitId }).from(lessons).where(eq(lessons.id, attachment.attachableId)).limit(1);
    const [unit] = await db.select({ courseId: units.courseId }).from(units).where(eq(units.id, lesson!.unitId)).limit(1);
    courseId = unit!.courseId;
  } else {
    const [assessment] = await db.select({ unitId: assessments.unitId }).from(assessments).where(eq(assessments.id, attachment.attachableId)).limit(1);
    const [unit] = await db.select({ courseId: units.courseId }).from(units).where(eq(units.id, assessment!.unitId)).limit(1);
    courseId = unit!.courseId;
  }

  await db.delete(materialAttachments).where(eq(materialAttachments.id, materialAttachmentId));

  await logEdit({
    courseId,
    action: "detach_material",
    entityType: "material",
    entityId: attachment.materialId,
    previousValue: {
      attachableType: attachment.attachableType,
      attachableId: attachment.attachableId,
      role: attachment.role,
    },
    newValue: null,
  });

  return Response.json({ ok: true });
}
