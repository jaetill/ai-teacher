// GET /api/search?q=<term>
// Auth: requires NextAuth session.
//
// Read-only search across the owner's curriculum: unit titles/summaries,
// lesson titles, and material titles/descriptions. Case-insensitive
// substring match, owner-scoped at the DB layer. Materials have no owner
// column yet, so they are scoped through the owner's course Drive folders
// and attachments (same approach as the material pool).

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import {
  courses,
  units,
  lessons,
  materials,
  materialAttachments,
} from "@/db/schema";
import { asc, eq, inArray } from "drizzle-orm";

const MAX_QUERY = 100;
const MAX_RESULTS_PER_KIND = 25;

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const ownerEmail = session?.user?.email;
  if (!ownerEmail) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return Response.json({ error: "q must be at least 2 characters" }, { status: 400 });
  }
  if (q.length > MAX_QUERY) {
    return Response.json({ error: `q too long (max ${MAX_QUERY})` }, { status: 413 });
  }
  const needle = q.toLowerCase();

  const ownCourses = await db
    .select({ id: courses.id, grade: courses.grade })
    .from(courses)
    .where(eq(courses.ownerEmail, ownerEmail))
    .orderBy(asc(courses.grade));
  const courseIds = ownCourses.map((c) => c.id);
  const gradeByCourse = new Map(ownCourses.map((c) => [c.id, c.grade]));

  const ownUnits = courseIds.length
    ? await db
        .select({
          id: units.id,
          courseId: units.courseId,
          title: units.title,
          summary: units.summary,
          quarter: units.quarter,
        })
        .from(units)
        .where(inArray(units.courseId, courseIds))
    : [];
  const unitIds = ownUnits.map((u) => u.id);
  const unitById = new Map(ownUnits.map((u) => [u.id, u]));

  const ownLessons = unitIds.length
    ? await db
        .select({ id: lessons.id, unitId: lessons.unitId, title: lessons.title })
        .from(lessons)
        .where(inArray(lessons.unitId, unitIds))
    : [];

  // Materials reachable through this owner's curriculum: attached to their
  // units/lessons. (In-memory filter keeps this route read-only and simple;
  // her corpus is a few hundred rows.)
  const lessonIds = ownLessons.map((l) => l.id);
  const attachableIds = [...unitIds, ...lessonIds];
  const attachments = attachableIds.length
    ? await db
        .select({
          materialId: materialAttachments.materialId,
          attachableType: materialAttachments.attachableType,
          attachableId: materialAttachments.attachableId,
        })
        .from(materialAttachments)
        .where(inArray(materialAttachments.attachableId, attachableIds))
    : [];
  const materialIds = [...new Set(attachments.map((a) => a.materialId))];
  const ownMaterials = materialIds.length
    ? await db
        .select({
          id: materials.id,
          title: materials.title,
          description: materials.description,
          materialType: materials.materialType,
          driveWebUrl: materials.driveWebUrl,
        })
        .from(materials)
        .where(inArray(materials.id, materialIds))
    : [];

  const matches = (text: string | null | undefined) =>
    !!text && text.toLowerCase().includes(needle);

  const unitHits = ownUnits
    .filter((u) => matches(u.title) || matches(u.summary))
    .slice(0, MAX_RESULTS_PER_KIND)
    .map((u) => ({
      id: u.id,
      title: u.title,
      quarter: u.quarter,
      grade: gradeByCourse.get(u.courseId) ?? null,
      courseId: u.courseId,
    }));

  const lessonHits = ownLessons
    .filter((l) => matches(l.title))
    .slice(0, MAX_RESULTS_PER_KIND)
    .map((l) => {
      const u = unitById.get(l.unitId);
      return {
        id: l.id,
        title: l.title,
        unitId: l.unitId,
        unitTitle: u?.title ?? null,
        quarter: u?.quarter ?? null,
        grade: u ? (gradeByCourse.get(u.courseId) ?? null) : null,
      };
    });

  const materialLinks = new Map<string, { type: string; id: string }[]>();
  for (const a of attachments) {
    const list = materialLinks.get(a.materialId) ?? [];
    list.push({ type: a.attachableType, id: a.attachableId });
    materialLinks.set(a.materialId, list);
  }
  const materialHits = ownMaterials
    .filter((m) => matches(m.title) || matches(m.description))
    .slice(0, MAX_RESULTS_PER_KIND)
    .map((m) => {
      const firstUnitLink = (materialLinks.get(m.id) ?? []).find((x) => x.type === "unit");
      const firstLessonLink = (materialLinks.get(m.id) ?? []).find((x) => x.type === "lesson");
      const viaLessonUnit = firstLessonLink
        ? ownLessons.find((l) => l.id === firstLessonLink.id)?.unitId
        : undefined;
      return {
        id: m.id,
        title: m.title,
        materialType: m.materialType,
        driveWebUrl: m.driveWebUrl,
        unitId: firstUnitLink?.id ?? viaLessonUnit ?? null,
      };
    });

  return Response.json({ q, units: unitHits, lessons: lessonHits, materials: materialHits });
}
