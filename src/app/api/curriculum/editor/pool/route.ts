// GET /api/curriculum/editor/pool?courseId=xxx
// Returns all materials for the course's units, with their current attachment info.
// Includes both unassigned materials and unit-level materials that could be reassigned.

import { db } from "@/db";
import {
  materials,
  materialAttachments,
  units,
  driveFolders,
} from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get("courseId");

  if (!courseId) {
    return Response.json({ error: "courseId required" }, { status: 400 });
  }

  // Get all units for this course to find their Drive folders
  const courseUnits = await db
    .select({ id: units.id, quarter: units.quarter })
    .from(units)
    .where(eq(units.courseId, courseId));

  if (courseUnits.length === 0) {
    return Response.json({ materials: [] });
  }

  // Get Drive folder IDs for this course's quarters
  const quarters = [...new Set(courseUnits.map((u) => u.quarter).filter(Boolean))];
  const folderKeys = quarters.map((q) => `grade_%_${q}_Curriculum`);

  // Get all materials that were imported into Drive folders for this course
  // We find them via the driveFolderId on materials matching the course's folders
  const allFolders = await db.select().from(driveFolders);
  const relevantFolderDriveIds = allFolders
    .filter((f) => {
      // Match folders that belong to this course's grade/quarters
      return quarters.some((q) => f.folderKey.includes(q as string));
    })
    .map((f) => f.driveId);

  // Get materials from these folders
  let courseMaterials;
  if (relevantFolderDriveIds.length > 0) {
    courseMaterials = await db
      .select()
      .from(materials)
      .where(inArray(materials.driveFolderId, relevantFolderDriveIds));
  } else {
    // Fallback: get all materials that are attached to this course's units
    const unitIds = courseUnits.map((u) => u.id);
    const attachedMaterialIds = await db
      .select({ materialId: materialAttachments.materialId })
      .from(materialAttachments)
      .where(
        sql`${materialAttachments.attachableType} = 'unit' AND ${materialAttachments.attachableId} IN ${unitIds}`
      );
    const materialIds = attachedMaterialIds.map((r) => r.materialId);
    courseMaterials = materialIds.length
      ? await db.select().from(materials).where(inArray(materials.id, materialIds))
      : [];
  }

  if (courseMaterials.length === 0) {
    return Response.json({ materials: [] });
  }

  // Get all attachments for these materials
  const materialIds = courseMaterials.map((m) => m.id);
  const attachments = await db
    .select()
    .from(materialAttachments)
    .where(inArray(materialAttachments.materialId, materialIds));

  // Build response with attachment info
  const attachmentsByMaterial = new Map<string, typeof attachments>();
  for (const att of attachments) {
    if (!attachmentsByMaterial.has(att.materialId)) {
      attachmentsByMaterial.set(att.materialId, []);
    }
    attachmentsByMaterial.get(att.materialId)!.push(att);
  }

  const result = courseMaterials.map((m) => {
    const atts = attachmentsByMaterial.get(m.id) ?? [];
    return {
      id: m.id,
      title: m.title,
      materialType: m.materialType,
      driveWebUrl: m.driveWebUrl,
      driveMimeType: m.driveMimeType,
      attachments: atts.map((a) => ({
        id: a.id,
        attachableType: a.attachableType,
        attachableId: a.attachableId,
        role: a.role,
      })),
    };
  });

  return Response.json({ materials: result });
}
