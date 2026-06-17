// POST /api/curriculum/editor/update-material
// Updates the role on a material_attachment and/or the materialType on the material itself.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { materialAttachments, materials, units, lessons, assessments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logEdit } from "../log-edit";
import { assertCourseOwner } from "../assert-course-owner";

const VALID_ROLES = ["primary", "supporting", "teacher_reference"];
const VALID_MATERIAL_TYPES = [
  "reading",
  "activity",
  "rubric",
  "lesson",
  "assessment",
  "resource",
  "curriculum",
  "other",
];

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const { attachmentId, role, materialType } = body as {
    attachmentId: string;
    role?: string;
    materialType?: string;
  };

  if (!attachmentId) {
    return Response.json({ error: "attachmentId required" }, { status: 400 });
  }

  if (!role && !materialType) {
    return Response.json({ error: "role or materialType required" }, { status: 400 });
  }

  if (role && !VALID_ROLES.includes(role)) {
    return Response.json({ error: `Invalid role: ${role}` }, { status: 400 });
  }

  if (materialType && !VALID_MATERIAL_TYPES.includes(materialType)) {
    return Response.json({ error: `Invalid materialType: ${materialType}` }, { status: 400 });
  }

  // Look up the attachment to get the materialId
  const [attachment] = await db
    .select()
    .from(materialAttachments)
    .where(eq(materialAttachments.id, attachmentId))
    .limit(1);

  if (!attachment) {
    return Response.json({ error: "Attachment not found" }, { status: 404 });
  }

  // Resolve courseId before any write so we can enforce ownership
  let courseId: string | undefined;
  if (attachment.attachableType === "unit") {
    const [unit] = await db
      .select({ courseId: units.courseId })
      .from(units)
      .where(eq(units.id, attachment.attachableId))
      .limit(1);
    courseId = unit?.courseId;
  } else if (attachment.attachableType === "lesson") {
    const [lesson] = await db
      .select({ unitId: lessons.unitId })
      .from(lessons)
      .where(eq(lessons.id, attachment.attachableId))
      .limit(1);
    if (lesson) {
      const [unit] = await db
        .select({ courseId: units.courseId })
        .from(units)
        .where(eq(units.id, lesson.unitId))
        .limit(1);
      courseId = unit?.courseId;
    }
  } else if (attachment.attachableType === "assessment") {
    const [assessment] = await db
      .select({ unitId: assessments.unitId })
      .from(assessments)
      .where(eq(assessments.id, attachment.attachableId))
      .limit(1);
    if (assessment) {
      const [unit] = await db
        .select({ courseId: units.courseId })
        .from(units)
        .where(eq(units.id, assessment.unitId))
        .limit(1);
      courseId = unit?.courseId;
    }
  }

  if (!courseId) {
    return Response.json({ error: "Course not found" }, { status: 404 });
  }

  const forbidden = await assertCourseOwner(courseId, session);
  if (forbidden) return forbidden;

  // Capture previous values before updating
  const prevRole = attachment.role;
  const prevMaterialType = materialType
    ? (
        await db
          .select({ materialType: materials.materialType })
          .from(materials)
          .where(eq(materials.id, attachment.materialId))
          .limit(1)
      )[0]?.materialType
    : undefined;

  // Update role on the attachment
  if (role) {
    await db
      .update(materialAttachments)
      .set({ role })
      .where(eq(materialAttachments.id, attachmentId));
  }

  // Update materialType on the material itself
  if (materialType) {
    await db
      .update(materials)
      .set({ materialType, updatedAt: new Date() })
      .where(eq(materials.id, attachment.materialId));
  }

  if (role) {
    await logEdit({
      courseId,
      action: "update_material_role",
      entityType: "material",
      entityId: attachment.materialId,
      previousValue: { role: prevRole, attachmentId },
      newValue: { role, attachmentId },
    });
  }
  if (materialType) {
    await logEdit({
      courseId,
      action: "update_material_type",
      entityType: "material",
      entityId: attachment.materialId,
      previousValue: { materialType: prevMaterialType },
      newValue: { materialType },
    });
  }

  return Response.json({ ok: true });
}
