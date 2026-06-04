// POST /api/lessons/[id]/notes
// Saves teacher notes for a lesson.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { lessons } from "@/db/schema";
import { and, eq } from "drizzle-orm";

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
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const { notes } = (await req.json()) as { notes: string };

  const [updated] = await db
    .update(lessons)
    .set({ teacherNotes: notes, updatedAt: new Date() })
    .where(and(eq(lessons.id, id), eq(lessons.ownerEmail, email)))
    .returning({ id: lessons.id });

  if (!updated) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  return Response.json({ ok: true });
}
