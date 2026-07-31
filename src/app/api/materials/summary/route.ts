// GET /api/materials/summary
// Owner-scoped rollup of imported materials, grouped grade → quarter → category,
// so a teacher can see what's been imported and for which quarter (and what's
// still missing) BEFORE any curriculum is built. Materials live in Drive
// folders keyed like "grade_7_Q1_Lessons"; ownership is via the folder's
// owner_email (open-null policy per ADR-0044 keeps legacy NULL-owner rows).

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { materials, driveFolders } from "@/db/schema";
import { ownedMaterials } from "@/lib/material-scope";
import { and, eq, isNull, or, like, desc } from "drizzle-orm";

type FileRow = { title: string; materialType: string; category: string };
type QuarterSummary = {
  quarter: string;
  total: number;
  categories: Record<string, number>;
  files: FileRow[];
};
type GradeSummary = { grade: number; total: number; quarters: QuarterSummary[] };

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
      g = { grade, total: 0, quarters: [] };
      grades.set(grade, g);
    }
    g.total += 1;

    let q = g.quarters.find((x) => x.quarter === quarter);
    if (!q) {
      q = { quarter, total: 0, categories: {}, files: [] };
      g.quarters.push(q);
    }
    q.total += 1;
    q.categories[category] = (q.categories[category] ?? 0) + 1;
    q.files.push({ title: r.title, materialType: r.materialType, category });
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
