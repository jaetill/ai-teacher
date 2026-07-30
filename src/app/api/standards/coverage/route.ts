// GET /api/standards/coverage
// Auth: requires NextAuth session.
//
// Read-only rollup of standards coverage across the owner's curriculum:
// every seeded standard for grades 6-8, with the units and lessons that
// link to it (via unit_standards / lesson_standards). Powers the coverage
// report and the vertical alignment view. Writes nothing; imposes nothing
// on imports.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import {
  courses,
  units,
  lessons,
  standards,
  unitStandards,
  lessonStandards,
} from "@/db/schema";
import { asc, eq, inArray } from "drizzle-orm";

export async function GET() {
  const session = await getServerSession(authOptions);
  const ownerEmail = session?.user?.email;
  if (!ownerEmail) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const ownCourses = await db
    .select({ id: courses.id, grade: courses.grade, title: courses.title })
    .from(courses)
    .where(eq(courses.ownerEmail, ownerEmail))
    .orderBy(asc(courses.grade));
  const courseIds = ownCourses.map((c) => c.id);

  const ownUnits = courseIds.length
    ? await db
        .select({
          id: units.id,
          courseId: units.courseId,
          title: units.title,
          quarter: units.quarter,
        })
        .from(units)
        .where(inArray(units.courseId, courseIds))
        .orderBy(asc(units.sortOrder))
    : [];
  const unitIds = ownUnits.map((u) => u.id);

  const ownLessons = unitIds.length
    ? await db
        .select({ id: lessons.id, unitId: lessons.unitId, title: lessons.title })
        .from(lessons)
        .where(inArray(lessons.unitId, unitIds))
        .orderBy(asc(lessons.sortOrder))
    : [];
  const lessonIds = ownLessons.map((l) => l.id);

  const uLinks = unitIds.length
    ? await db
        .select({ standardId: unitStandards.standardId, unitId: unitStandards.unitId })
        .from(unitStandards)
        .where(inArray(unitStandards.unitId, unitIds))
    : [];
  const lLinks = lessonIds.length
    ? await db
        .select({
          standardId: lessonStandards.standardId,
          lessonId: lessonStandards.lessonId,
          coverageType: lessonStandards.coverageType,
        })
        .from(lessonStandards)
        .where(inArray(lessonStandards.lessonId, lessonIds))
    : [];

  const allStandards = await db
    .select({
      id: standards.id,
      grade: standards.grade,
      strandCode: standards.strandCode,
      strandName: standards.strandName,
      description: standards.description,
      parentId: standards.parentId,
    })
    .from(standards)
    .orderBy(asc(standards.grade), asc(standards.strandCode), asc(standards.id));

  // Index lookups
  const unitById = new Map(ownUnits.map((u) => [u.id, u]));
  const lessonById = new Map(ownLessons.map((l) => [l.id, l]));
  const courseById = new Map(ownCourses.map((c) => [c.id, c]));

  const coverage = allStandards.map((s) => {
    const inUnits = uLinks
      .filter((x) => x.standardId === s.id)
      .map((x) => {
        const u = unitById.get(x.unitId);
        const c = u ? courseById.get(u.courseId) : undefined;
        return u
          ? { unitId: u.id, unitTitle: u.title, quarter: u.quarter, grade: c?.grade ?? null }
          : null;
      })
      .filter(Boolean);
    const inLessons = lLinks
      .filter((x) => x.standardId === s.id)
      .map((x) => {
        const l = lessonById.get(x.lessonId);
        const u = l ? unitById.get(l.unitId) : undefined;
        const c = u ? courseById.get(u.courseId) : undefined;
        return l && u
          ? {
              lessonId: l.id,
              lessonTitle: l.title,
              unitId: u.id,
              unitTitle: u.title,
              quarter: u.quarter,
              grade: c?.grade ?? null,
              coverageType: x.coverageType,
            }
          : null;
      })
      .filter(Boolean);
    return { ...s, units: inUnits, lessons: inLessons, covered: inUnits.length + inLessons.length > 0 };
  });

  return Response.json({ standards: coverage, courses: ownCourses });
}
