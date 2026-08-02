// GET /api/lesson-templates/report — which lessons don't match the shape the
// teacher says she teaches (#647).
//
// This is the payoff of templates being data. Once the structure is declared,
// "make my material consistent" stops being a vibe and becomes a query: for
// every lesson, resolve its template and list the required fields it's
// missing. Read-only — it reports, it never edits her curriculum.
//
// Query: ?courseId= (optional) to scope to one course.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { lessons, units, courses, lessonTemplates } from "@/db/schema";
import { and, eq, asc, isNull, or } from "drizzle-orm";
import { isUuid } from "@/lib/api-utils";
import { checkLesson, CLASSIC_FIELDS, type TemplateField } from "@/lib/lesson-template";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const ownerEmail = session?.user?.email;
  if (!ownerEmail) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get("courseId");
  if (courseId && !isUuid(courseId)) {
    return Response.json({ error: "Invalid courseId" }, { status: 400 });
  }

  const templateRows = await db
    .select({
      id: lessonTemplates.id,
      name: lessonTemplates.name,
      fields: lessonTemplates.fields,
      isDefault: lessonTemplates.isDefault,
    })
    .from(lessonTemplates)
    .where(or(eq(lessonTemplates.ownerEmail, ownerEmail), isNull(lessonTemplates.ownerEmail)));

  const byId = new Map(templateRows.map((t) => [t.id, t]));
  const fallback = templateRows.find((t) => t.isDefault) ?? null;

  const rows = await db
    .select({
      id: lessons.id,
      title: lessons.title,
      lessonPlan: lessons.lessonPlan,
      templateId: lessons.templateId,
      unitId: units.id,
      unitTitle: units.title,
      courseId: courses.id,
      grade: courses.grade,
      courseTemplateId: courses.lessonTemplateId,
    })
    .from(lessons)
    .innerJoin(units, eq(lessons.unitId, units.id))
    .innerJoin(courses, eq(units.courseId, courses.id))
    .where(
      courseId
        ? and(eq(courses.ownerEmail, ownerEmail), eq(courses.id, courseId))
        : eq(courses.ownerEmail, ownerEmail),
    )
    .orderBy(asc(courses.grade), asc(units.sortOrder), asc(lessons.sortOrder));

  // lesson → course → the teacher's default → Classic. Every step is
  // nullable, which is why no backfill was needed to ship this.
  function resolve(lessonTemplateId: string | null, courseTemplateId: string | null) {
    const hit =
      (lessonTemplateId ? byId.get(lessonTemplateId) : null) ??
      (courseTemplateId ? byId.get(courseTemplateId) : null) ??
      fallback;
    if (!hit) return { name: "Classic", fields: CLASSIC_FIELDS };
    return { name: hit.name, fields: (hit.fields as TemplateField[]) ?? CLASSIC_FIELDS };
  }

  const results = rows.map((l) => {
    const template = resolve(l.templateId, l.courseTemplateId);
    const check = checkLesson(l.lessonPlan, template.fields);
    return {
      lessonId: l.id,
      title: l.title,
      unitId: l.unitId,
      unitTitle: l.unitTitle,
      courseId: l.courseId,
      grade: l.grade,
      templateName: template.name,
      missingRequired: check.missingRequired,
      emptyFields: check.emptyFields,
      unknownKeys: check.unknownKeys,
      complete: check.complete,
    };
  });

  const incomplete = results.filter((r) => !r.complete);

  // Which fields go missing most often — the one number that tells her where
  // the inconsistency actually is, rather than just how much there is.
  const gapCounts = new Map<string, number>();
  for (const r of incomplete) {
    for (const label of r.missingRequired) {
      gapCounts.set(label, (gapCounts.get(label) ?? 0) + 1);
    }
  }
  const commonGaps = [...gapCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return Response.json({
    total: results.length,
    complete: results.length - incomplete.length,
    incomplete: incomplete.length,
    commonGaps,
    lessons: results,
  });
}
