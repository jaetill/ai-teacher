// POST /api/curriculum/save
// Saves an AI-generated lesson sequence markdown to a unit.

import { db } from "@/db";
import { units } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  const { unitId, lessonPlan } = (await req.json()) as {
    unitId: string;
    lessonPlan: string;
  };

  if (!unitId || !lessonPlan) {
    return Response.json({ error: "Missing unitId or lessonPlan" }, { status: 400 });
  }

  const [updated] = await db
    .update(units)
    .set({
      aiGenerationContext: { lessonPlanMarkdown: lessonPlan },
      updatedAt: new Date(),
    })
    .where(eq(units.id, unitId))
    .returning({ id: units.id });

  if (!updated) {
    return Response.json({ error: "Unit not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
