// POST /api/units/[id]/notes
// Saves teacher notes for a unit.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { units } from "@/db/schema";
import { eq } from "drizzle-orm";
import { assertCourseOwnership } from "../../../curriculum/editor/assert-ownership";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userEmail = session.user?.email;
  if (!userEmail) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;

  const [unit] = await db
    .select({ courseId: units.courseId })
    .from(units)
    .where(eq(units.id, id))
    .limit(1);

  if (!unit) {
    return Response.json({ error: "Unit not found" }, { status: 404 });
  }

  const forbidden = await assertCourseOwnership(unit.courseId, userEmail);
  if (forbidden) return forbidden;

  const body = await req.json().catch(() => null);
  if (!body || typeof body.notes !== "string") {
    return Response.json({ error: "notes is required" }, { status: 400 });
  }
  const { notes } = body as { notes: string };

  const [updated] = await db
    .update(units)
    .set({ teacherNotes: notes, updatedAt: new Date() })
    .where(eq(units.id, id))
    .returning({ id: units.id });

  if (!updated) {
    return Response.json({ error: "Unit not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
