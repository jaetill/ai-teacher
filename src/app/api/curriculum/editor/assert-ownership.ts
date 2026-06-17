import { db } from "@/db";
import { courses } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function assertCourseOwnership(
  courseId: string | null | undefined,
  userEmail: string | null | undefined
): Promise<Response | null> {
  if (!courseId || !userEmail) return Response.json({ error: "Forbidden" }, { status: 403 });
  const [course] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.ownerEmail, userEmail)))
    .limit(1);
  if (!course) return Response.json({ error: "Forbidden" }, { status: 403 });
  return null;
}
