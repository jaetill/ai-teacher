// /api/sections — class periods (instances of a course), the scaffold
// `sections` table coming to life. A section is the calendar's row unit:
// "Grade 8 — Period 1". Sections currently share their course's plan and
// pacing; per-section drift (different snow days, different speeds) is the
// future actual-vs-planned feature.
//
// GET    → all of the caller's sections, with course info for row labels.
// POST   → { courseId, name, period? } create one (course must be owned and
//          have a school year).
// PATCH  → { id, name?, period?, meetingDays? } edit one. meetingDays is the
//          per-section override (#669): a CSV of ISO weekdays, or null to go
//          back to inheriting the course's days.
// DELETE → ?id= remove one (owner-scoped through its course).

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { courses, sections } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { isUuid, readJson } from "@/lib/api-utils";

async function ownerEmailOr401(): Promise<string | Response> {
  const session = await getServerSession(authOptions);
  const ownerEmail = session?.user?.email;
  if (!ownerEmail) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  return ownerEmail;
}

export async function GET() {
  const ownerEmail = await ownerEmailOr401();
  if (ownerEmail instanceof Response) return ownerEmail;

  const rows = await db
    .select({
      id: sections.id,
      name: sections.name,
      period: sections.period,
      meetingDays: sections.meetingDays,
      courseId: sections.courseId,
      grade: courses.grade,
      courseTitle: courses.title,
      schoolYearId: courses.schoolYearId,
    })
    .from(sections)
    .innerJoin(courses, eq(sections.courseId, courses.id))
    .where(eq(courses.ownerEmail, ownerEmail))
    .orderBy(asc(courses.grade), asc(sections.name));

  return Response.json({ sections: rows });
}

export async function POST(req: Request) {
  const ownerEmail = await ownerEmailOr401();
  if (ownerEmail instanceof Response) return ownerEmail;

  const body = await readJson<{ courseId?: string; name?: string; period?: string }>(req);
  if (!body) return Response.json({ error: "Invalid JSON body" }, { status: 400 });

  const { courseId } = body;
  const name = (body.name ?? "").trim();
  const period = (body.period ?? "").trim() || null;
  if (!courseId || !isUuid(courseId)) {
    return Response.json({ error: "Invalid courseId" }, { status: 400 });
  }
  if (name.length < 1 || name.length > 80) {
    return Response.json({ error: "Name must be 1-80 characters" }, { status: 400 });
  }
  if (period && period.length > 20) {
    return Response.json({ error: "Period must be at most 20 characters" }, { status: 400 });
  }

  const [course] = await db
    .select({ id: courses.id, schoolYearId: courses.schoolYearId })
    .from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.ownerEmail, ownerEmail)))
    .limit(1);
  if (!course) return Response.json({ error: "Course not found" }, { status: 404 });
  if (!course.schoolYearId) {
    return Response.json(
      { error: "Course has no school year assigned; assign one first." },
      { status: 400 },
    );
  }

  const [created] = await db
    .insert(sections)
    .values({ courseId, schoolYearId: course.schoolYearId, name, period })
    .returning({ id: sections.id });

  return Response.json({ id: created.id });
}

export async function PATCH(req: Request) {
  const ownerEmail = await ownerEmailOr401();
  if (ownerEmail instanceof Response) return ownerEmail;

  const body = await readJson<{
    id?: string;
    name?: string;
    period?: string | null;
    meetingDays?: string | null;
  }>(req);
  if (!body) return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  if (!body.id || !isUuid(body.id)) {
    return Response.json({ error: "Invalid section id" }, { status: 400 });
  }

  const updates: { name?: string; period?: string | null; meetingDays?: string | null } = {};
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (name.length < 1 || name.length > 80) {
      return Response.json({ error: "Name must be 1-80 characters" }, { status: 400 });
    }
    updates.name = name;
  }
  if (body.period !== undefined) {
    const period = (body.period ?? "").trim();
    if (period.length > 20) {
      return Response.json({ error: "Period must be at most 20 characters" }, { status: 400 });
    }
    updates.period = period || null;
  }
  if (body.meetingDays !== undefined) {
    if (body.meetingDays === null || body.meetingDays === "") {
      updates.meetingDays = null; // inherit the course again
    } else {
      const days = body.meetingDays.split(",").map((x) => parseInt(x.trim(), 10));
      if (days.length === 0 || days.some((n) => !(n >= 1 && n <= 7))) {
        return Response.json({ error: "Invalid meetingDays" }, { status: 400 });
      }
      updates.meetingDays = [...new Set(days)].sort().join(",");
    }
  }
  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }

  // Owner-scoped: resolve the section through its course's owner first.
  const [row] = await db
    .select({ id: sections.id })
    .from(sections)
    .innerJoin(courses, eq(sections.courseId, courses.id))
    .where(and(eq(sections.id, body.id), eq(courses.ownerEmail, ownerEmail)))
    .limit(1);
  if (!row) return Response.json({ error: "Section not found" }, { status: 404 });

  await db.update(sections).set(updates).where(eq(sections.id, body.id));
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const ownerEmail = await ownerEmailOr401();
  if (ownerEmail instanceof Response) return ownerEmail;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id || !isUuid(id)) {
    return Response.json({ error: "Invalid section id" }, { status: 400 });
  }

  // Owner-scoped delete: resolve the section through its course's owner.
  const [row] = await db
    .select({ id: sections.id })
    .from(sections)
    .innerJoin(courses, eq(sections.courseId, courses.id))
    .where(and(eq(sections.id, id), eq(courses.ownerEmail, ownerEmail)))
    .limit(1);
  if (!row) return Response.json({ error: "Section not found" }, { status: 404 });

  await db.delete(sections).where(eq(sections.id, id));
  return Response.json({ ok: true });
}
