import { db } from "@/db";
import { courses } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { Session } from "next-auth";

export async function assertCourseOwner(
  courseId: string,
  session: Session
): Promise<Response | null> {
  const [course] = await db
    .select({ ownerEmail: courses.ownerEmail })
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);

  if (course?.ownerEmail !== session.user?.email) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
