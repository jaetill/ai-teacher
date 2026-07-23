// PATCH /api/courses/[id]
// Rename a course (owner-scoped). Body: { title: string }

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { courses } from "@/db/schema";
import { and, eq } from "drizzle-orm";
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
