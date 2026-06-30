// GET /api/curriculum/editor/pool?courseId=xxx
// Returns all materials for the course's units, with their current attachment info.
// Includes both unassigned materials and unit-level materials that could be reassigned.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import {
  materials,
  materialAttachments,
  units,
  driveFolders,
  courses,
} from "@/db/schema";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { assertCourseOwnership } from "../assert-ownership";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userEmail = session.user?.email;
  if (!userEmail) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get("courseId");

  if (!courseId) {
    return Response.json({ error: "courseId required" }, { status: 400 });
  }

  const forbidden = await assertCourseOwnership(courseId, userEmail);
  if (forbidden) return forbidden;

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

  // Fetch the course grade so we can build exact folder keys (prevents cross-user leakage
  // via fuzzy quarter substring matching across other users' grade folders).
  const [courseRow] = await db
    .select({ grade: courses.grade })
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);
  const grade = courseRow?.grade;

  const exactFolderKeys = grade != null
    ? quarters.map((q) => `grade_${grade}_${q}_Curriculum`)
    : [];

  // Scope the driveFolders query to exact keys for this course's grade+quarter combination.
  // Using inArray with exact keys (not a full table scan + substring filter) ensures we
  // never return folder records owned by a different user's course in the same quarter.
  // Scope by owner too: same folder_key can exist for another user's same-grade
  // course (#481). Open-null policy (ADR-0044) keeps legacy NULL-owner rows visible.
  const relevantFolderDriveIds = exactFolderKeys.length > 0
    ? (
        await db
          .select({ driveId: driveFolders.driveId })
          .from(driveFolders)
          .where(
            and(
              inArray(driveFolders.folderKey, exactFolderKeys),
              or(
                eq(driveFolders.ownerEmail, userEmail),
                isNull(driveFolders.ownerEmail)
              )
            )
          )
      ).map((f) => f.driveId)
    : [];

  const materialOwnerPredicate = or(eq(materials.ownerEmail, userEmail), isNull(materials.ownerEmail));

  // Get materials from these folders
  let courseMaterials;
  if (relevantFolderDriveIds.length > 0) {
    courseMaterials = await db
      .select()
      .from(materials)
      .where(
        and(
          inArray(materials.driveFolderId, relevantFolderDriveIds),
          materialOwnerPredicate,
        )
      );
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
      ? await db.select().from(materials).where(
          and(inArray(materials.id, materialIds), materialOwnerPredicate)
        )
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
