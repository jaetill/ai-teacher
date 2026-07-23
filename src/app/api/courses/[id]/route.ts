// PATCH  /api/courses/[id]  — rename a course (owner-scoped). Body: { title }
// DELETE /api/courses/[id]  — delete a course and its whole curriculum tree

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { courses, units, lessons, assessments, materialAttachments } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { readJson, isUuid } from "@/lib/api-utils";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const ownerEmail = session.user?.email;
  if (!ownerEmail) {
    return Response.json({ error: "Session missing email" }, { status: 401 });
  }

  const { id } = await params;
  if (!isUuid(id)) {
    return Response.json({ error: "Invalid course id" }, { status: 400 });
  }

  const body = await readJson<{ title?: string }>(req);
  if (!body) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (title.length === 0 || title.length > 200) {
    return Response.json(
      { error: "title must be a non-empty string of at most 200 characters" },
      { status: 400 },
    );
  }

  // Update only when the course belongs to the caller; returning() tells us
  // whether a row matched (404 otherwise — never reveals other owners' ids).
  const updated = await db
    .update(courses)
    .set({ title, updatedAt: new Date() })
    .where(and(eq(courses.id, id), eq(courses.ownerEmail, ownerEmail)))
    .returning({ id: courses.id, title: courses.title });

  if (updated.length === 0) {
    return Response.json({ error: "Course not found" }, { status: 404 });
  }

  return Response.json({ ok: true, course: updated[0] });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const ownerEmail = session.user?.email;
  if (!ownerEmail) {
    return Response.json({ error: "Session missing email" }, { status: 401 });
  }

  const { id } = await params;
  if (!isUuid(id)) {
    return Response.json({ error: "Invalid course id" }, { status: 400 });
  }

  // Authorize: the course must belong to the caller.
  const [course] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.id, id), eq(courses.ownerEmail, ownerEmail)))
    .limit(1);
  if (!course) {
    return Response.json({ error: "Course not found" }, { status: 404 });
  }

  // Deleting the course cascades to units → lessons/assessments, their
  // standards, the edit log, sections, and scheduled units (all FK
  // onDelete: cascade). material_attachments are polymorphic (no FK), so they
  // must be cleaned up explicitly or they'd be orphaned.
  const unitRows = await db.select({ id: units.id }).from(units).where(eq(units.courseId, id));
  const unitIds = unitRows.map((u) => u.id);

  let attachableIds = [...unitIds];
  if (unitIds.length > 0) {
    const [lessonRows, assessmentRows] = await Promise.all([
      db.select({ id: lessons.id }).from(lessons).where(inArray(lessons.unitId, unitIds)),
      db.select({ id: assessments.id }).from(assessments).where(inArray(assessments.unitId, unitIds)),
    ]);
    attachableIds = [...unitIds, ...lessonRows.map((l) => l.id), ...assessmentRows.map((a) => a.id)];
  }

  try {
    const statements = [];
    if (attachableIds.length > 0) {
      statements.push(
        db.delete(materialAttachments).where(inArray(materialAttachments.attachableId, attachableIds)),
      );
    }
    statements.push(db.delete(courses).where(eq(courses.id, id)));
    await db.batch(statements as [(typeof statements)[number], ...typeof statements]);
  } catch (err) {
    console.error("[courses.DELETE] failed", err);
    return Response.json({ error: "Failed to delete course" }, { status: 500 });
  }

  return Response.json({ ok: true });
}
