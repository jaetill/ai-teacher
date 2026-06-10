// POST /api/lessons/[id]/notes
// Saves teacher notes for a lesson.

import { db } from "@/db";
import { lessons } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
