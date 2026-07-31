// POST /api/curriculum/editor/attach-material
// Creates a new material attachment.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { materialAttachments, materials, units, lessons, assessments } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { readJson, isUuid } from "@/lib/api-utils";
import { normalizeMaterialRole } from "@/lib/material-roles";
import { ownedMaterials } from "@/lib/material-scope";
import { logEdit } from "../log-edit";
import { assertCourseOwnership } from "../assert-ownership";
import type { AttachMaterialPayload } from "@/types/curriculum-editor";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await readJson<AttachMaterialPayload>(req);
  if (!body) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { materialId, attachableType, attachableId } = body;
  // Normalize against the shared allowlist (update-material already validates
  // roles; this route accepted anything verbatim).
  const role = normalizeMaterialRole(body.role);

  if (!isUuid(materialId) || !isUuid(attachableId)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }
  if (!["unit", "lesson", "assessment"].includes(attachableType)) {
    return Response.json({ error: "Invalid attachableType" }, { status: 400 });
  }

  // Verify the material exists AND belongs to the caller (#566) before
  // inserting — a dangling materialId used to surface as an uncaught FK
  // violation → 500, and any authenticated user could attach another user's
  // material by id. Ownership of the attachable's course is enforced below.
  const [material] = await db
    .select({ id: materials.id })
    .from(materials)
    .where(and(eq(materials.id, materialId), ownedMaterials(session.user?.email)))
    .limit(1);
  if (!material) {
    return Response.json({ error: "Material not found" }, { status: 404 });
  }

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
    if (!unit) return Response.json({ error: "Unit not found" }, { status: 404 });
    courseId = unit.courseId;
  } else {
    const [assessment] = await db.select({ unitId: assessments.unitId }).from(assessments).where(eq(assessments.id, attachableId)).limit(1);
    if (!assessment) return Response.json({ error: "Assessment not found" }, { status: 404 });
    const [unit] = await db.select({ courseId: units.courseId }).from(units).where(eq(units.id, assessment.unitId)).limit(1);
    if (!unit) return Response.json({ error: "Unit not found" }, { status: 404 });
    courseId = unit.courseId;
  }

  const forbidden = await assertCourseOwnership(courseId, session.user?.email);
  if (forbidden) return forbidden;

  const [attachment] = await db.insert(materialAttachments).values({
    materialId,
    attachableType,
    attachableId,
    role,
  }).returning({ id: materialAttachments.id });

  // Audit-log failure must not turn an already-committed write into a 500.
  try {
    await logEdit({
      courseId,
      action: "attach_material",
      entityType: "material",
      entityId: materialId,
      previousValue: null,
      newValue: { attachableType, attachableId, role },
    });
  } catch (err) {
    console.error("[attach-material] logEdit failed:", err);
  }

  return Response.json({ ok: true, attachmentId: attachment.id });
}
