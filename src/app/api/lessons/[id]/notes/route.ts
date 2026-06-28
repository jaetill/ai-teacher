// POST /api/lessons/[id]/notes
// Saves teacher notes for a lesson — requires auth + course ownership.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { lessons, units } from "@/db/schema";
import { eq } from "drizzle-orm";
import { assertCourseOwnership } from "@/app/api/curriculum/editor/assert-ownership";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const email = session.user?.email;
  if (!email) {
    return Response.json({ error: "Session missing email" }, { status: 401 });
  }

  const { id } = await params;

  let notes: string;
  try {
    const body = await req.json();
    if (typeof body?.notes !== "string" || body.notes.length > 50_000) {
      return Response.json({ error: "Invalid notes" }, { status: 400 });
    }
    notes = body.notes;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const [lesson] = await db
    .select({ unitId: lessons.unitId })
    .from(lessons)
    .where(eq(lessons.id, id))
    .limit(1);

  if (!lesson) {
    return Response.json({ error: "Lesson not found" }, { status: 404 });
  }

  const [unit] = await db
    .select({ courseId: units.courseId })
    .from(units)
    .where(eq(units.id, lesson.unitId))
    .limit(1);

  const forbidden = await assertCourseOwnership(unit?.courseId, email);
  if (forbidden) return forbidden;

  const [updated] = await db
    .update(lessons)
    .set({ teacherNotes: notes, updatedAt: new Date() })
    .where(eq(lessons.id, id))
    .returning({ id: lessons.id });

  if (!updated) {
    return Response.json({ error: "Lesson not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
