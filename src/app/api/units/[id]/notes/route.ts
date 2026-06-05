// POST /api/units/[id]/notes
// Saves teacher notes for a unit.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { units } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const { notes } = (await req.json()) as { notes: string };
  const userEmail = session.user.email;

  const [updated] = await db
    .update(units)
    .set({ teacherNotes: notes, updatedAt: new Date() })
    .where(and(eq(units.id, id), eq(units.ownerEmail, userEmail)))
    .returning({ id: units.id });

  if (!updated) {
    return Response.json({ error: "Unit not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
