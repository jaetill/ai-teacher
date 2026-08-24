// GET /api/import/targets
//
// The destination side of an import: which school years exist and which
// courses the teacher already owns. This is what makes "import into a past
// year" possible at all — previously the target was implied by the current
// school year and a folder name, so there was nothing to choose.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { courses, schoolYears } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

export async function GET() {
  const session = await getServerSession(authOptions);
  const ownerEmail = session?.user?.email;
  if (!ownerEmail) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const [years, owned] = await Promise.all([
    db
      .select({
        id: schoolYears.id,
        name: schoolYears.name,
        isCurrent: schoolYears.isCurrent,
        startDate: schoolYears.startDate,
      })
      .from(schoolYears)
      .orderBy(asc(schoolYears.startDate)),
    db
      .select({
        id: courses.id,
        title: courses.title,
        grade: courses.grade,
        subject: courses.subject,
        track: courses.track,
        schoolYearId: courses.schoolYearId,
      })
      .from(courses)
      .where(eq(courses.ownerEmail, ownerEmail))
      .orderBy(asc(courses.grade)),
  ]);

  return Response.json({
    schoolYears: years,
    courses: owned,
    currentSchoolYearId: years.find((y) => y.isCurrent)?.id ?? null,
  });
}
