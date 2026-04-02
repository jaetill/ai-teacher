// POST /api/units/[id]/notes
// Saves teacher notes for a unit.

import { db } from "@/db";
import { units } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { notes } = (await req.json()) as { notes: string };

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
