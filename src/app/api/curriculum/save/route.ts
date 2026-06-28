// POST /api/curriculum/save
// Saves an AI-generated lesson sequence markdown to a unit.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { units } from "@/db/schema";
import { eq } from "drizzle-orm";
import { assertCourseOwnership } from "@/app/api/curriculum/editor/assert-ownership";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const email = session.user?.email;
  if (!email) {
    return Response.json({ error: "Session missing email" }, { status: 401 });
  }

  const { unitId, lessonPlan } = (await req.json()) as {
    unitId: string;
    lessonPlan: string;
  };

  if (!unitId || !lessonPlan) {
    return Response.json({ error: "Missing unitId or lessonPlan" }, { status: 400 });
  }

  // Authorization: only the owner of the unit's course may overwrite its lesson
  // plan. Without this, any authenticated user could overwrite any unit (#106).
  const [unit] = await db
    .select({ courseId: units.courseId })
    .from(units)
    .where(eq(units.id, unitId))
    .limit(1);

  if (!unit) {
    return Response.json({ error: "Unit not found" }, { status: 404 });
  }

  const forbidden = await assertCourseOwnership(unit.courseId, email);
  if (forbidden) return forbidden;

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
