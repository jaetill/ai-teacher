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
  lessons,
  assessments,
  driveFolders,
  courses,
} from "@/db/schema";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
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

  // Load materials from ALL of the course's quarter category folders (not just
  // Curriculum) so the pool reflects everything the teacher imported. The UI
  // filters by type and unit on top of this full set.
  const CATEGORIES = ["Curriculum", "Lessons", "Activities", "Assessments", "Resources"];
  const exactFolderKeys =
    grade != null
      ? quarters.flatMap((q) => CATEGORIES.map((c) => `grade_${grade}_${q}_${c}`))
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

  // Get materials from these folders
  let courseMaterials;
  if (relevantFolderDriveIds.length > 0) {
    courseMaterials = await db
      .select()
      .from(materials)
      .where(inArray(materials.driveFolderId, relevantFolderDriveIds));
  } else {
    // Fallback (rare — only when the course's quarter folders aren't registered):
    // gather every material attached to the course's units, lessons, or
    // assessments. The build attaches to lessons, so a unit-only match missed them.
    const unitIds = courseUnits.map((u) => u.id);
    const [unitLessons, unitAssessments] = await Promise.all([
      db.select({ id: lessons.id }).from(lessons).where(inArray(lessons.unitId, unitIds)),
      db.select({ id: assessments.id }).from(assessments).where(inArray(assessments.unitId, unitIds)),
    ]);
    const attachableIds = [
      ...unitIds,
      ...unitLessons.map((l) => l.id),
      ...unitAssessments.map((a) => a.id),
    ];
    const attachedMaterialIds = attachableIds.length
      ? await db
          .select({ materialId: materialAttachments.materialId })
          .from(materialAttachments)
          .where(inArray(materialAttachments.attachableId, attachableIds))
      : [];
    const materialIds = [...new Set(attachedMaterialIds.map((r) => r.materialId))];
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
      sourceUnit: m.sourceUnit,
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
