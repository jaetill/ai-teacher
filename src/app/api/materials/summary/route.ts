// GET /api/materials/summary
// Owner-scoped rollup of imported materials, grouped grade → quarter → category,
// so a teacher can see what's been imported and for which quarter (and what's
// still missing) BEFORE any curriculum is built. Materials live in Drive
// folders keyed like "grade_7_Q1_Lessons"; ownership is via the folder's
// owner_email (open-null policy per ADR-0044 keeps legacy NULL-owner rows).

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { courses, materials, driveFolders, units } from "@/db/schema";
import { ownedMaterials } from "@/lib/material-scope";
import { and, eq, inArray, isNull, or, like, desc } from "drizzle-orm";

type FileRow = { title: string; materialType: string; category: string };
type QuarterSummary = {
  quarter: string;
  total: number;
  categories: Record<string, number>;
  files: FileRow[];
  // #604: a built quarter graduates off the staging view — the client shows a
  // quiet done-state instead of the file ledger.
  built: boolean;
  // Materials imported AFTER this quarter was built. They are in neither the
  // curriculum nor the ledger, so the card has to say so or they are lost.
  newSinceBuild: number;
};
type GradeSummary = {
  grade: number;
  total: number;
  quarters: QuarterSummary[];
  // Course to open when a built quarter's link is clicked (current-year first).
  courseId: string | null;
};

const QUARTER_ORDER = ["Summer", "Q1", "Q2", "Q3", "Q4", "YearPlan"];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const ownerEmail = session.user?.email;
  if (!ownerEmail) {
    return Response.json({ error: "Session missing email" }, { status: 401 });
  }

  const rows = await db
    .select({
      title: materials.title,
      materialType: materials.materialType,
      folderKey: driveFolders.folderKey,
      createdAt: materials.createdAt,
    })
    .from(materials)
    .innerJoin(driveFolders, eq(materials.driveFolderId, driveFolders.driveId))
    .where(
      and(
        like(driveFolders.folderKey, "grade\\_%"),
        or(eq(driveFolders.ownerEmail, ownerEmail), isNull(driveFolders.ownerEmail)),
        ownedMaterials(ownerEmail),
      ),
    )
    .orderBy(desc(materials.createdAt));

  // #604: which grade+quarter combos are already built (any owned course of
  // that grade has units in that quarter). Built quarters graduate off the
  // import staging view; their files live in the curriculum and the pool.
  const ownCourses = await db
    .select({ id: courses.id, grade: courses.grade })
    .from(courses)
    .where(eq(courses.ownerEmail, ownerEmail));
  const courseById = new Map(ownCourses.map((c) => [c.id, c.grade]));
  const builtSet = new Set<string>(); // "grade:quarter"
  // When each grade+quarter was last built. A built quarter shows no file
  // ledger, so without this a material imported after the build is invisible
  // AND unbuildable — the card offers only "Open". That dead end is what this
  // timestamp exists to break.
  const builtAt = new Map<string, Date>();
  if (ownCourses.length > 0) {
    const unitRows = await db
      .select({ courseId: units.courseId, quarter: units.quarter, createdAt: units.createdAt })
      .from(units)
      .where(inArray(units.courseId, ownCourses.map((c) => c.id)));
    for (const u of unitRows) {
      const g = courseById.get(u.courseId);
      if (g == null || !u.quarter) continue;
      const key = `${g}:${u.quarter}`;
      builtSet.add(key);
      // Latest unit wins: that is when the quarter was most recently built.
      const prev = builtAt.get(key);
      if (!prev || u.createdAt > prev) builtAt.set(key, u.createdAt);
    }
  }
  const courseIdByGrade = new Map<number, string>();
  for (const c of ownCourses) {
    // Last write wins is fine here; any course of the grade opens the editor,
    // which is year-aware on its own.
    courseIdByGrade.set(c.grade, c.id);
  }

  // folderKey shape: grade_<n>_<quarter>[_<category>]
  const grades = new Map<number, GradeSummary>();

  for (const r of rows) {
    const parts = r.folderKey.split("_"); // ["grade","7","Q1","Lessons"]
    const grade = parseInt(parts[1], 10);
    const quarter = parts[2] ?? "Other";
    const category = parts[3] ?? "Uncategorized";
    if (!Number.isFinite(grade)) continue;

    let g = grades.get(grade);
    if (!g) {
      g = { grade, total: 0, quarters: [], courseId: courseIdByGrade.get(grade) ?? null };
      grades.set(grade, g);
    }
    g.total += 1;

    let q = g.quarters.find((x) => x.quarter === quarter);
    if (!q) {
      q = {
        quarter,
        total: 0,
        categories: {},
        files: [],
        built: builtSet.has(`${grade}:${quarter}`),
        newSinceBuild: 0,
      };
      g.quarters.push(q);
    }
    q.total += 1;
    q.categories[category] = (q.categories[category] ?? 0) + 1;
    // #604: built quarters keep counts (for the done-state line) but no file
    // ledger — those files live in the curriculum and the pool now.
    if (!q.built) {
      q.files.push({ title: r.title, materialType: r.materialType, category });
    } else {
      // Imported after the build, so it is in neither the curriculum nor the
      // ledger. Counting it is what makes "you have new material here" sayable.
      const when = builtAt.get(`${grade}:${quarter}`);
      if (when && r.createdAt > when) q.newSinceBuild += 1;
    }
  }

  const result = [...grades.values()]
    .sort((a, b) => a.grade - b.grade)
    .map((g) => ({
      ...g,
      quarters: g.quarters.sort(
        (a, b) => QUARTER_ORDER.indexOf(a.quarter) - QUARTER_ORDER.indexOf(b.quarter),
      ),
    }));

  return Response.json({ grades: result });
}
