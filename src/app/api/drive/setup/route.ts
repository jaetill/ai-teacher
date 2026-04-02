// POST /api/drive/setup
// Auth: requires Google OAuth session
// Creates the Drive folder structure for the AI Teacher app.
// Returns: JSON with folder IDs for all created/found folders.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { findOrCreateFolder } from "@/lib/drive";

const GRADES = [6, 7, 8];
const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];
const UNIT_SUBFOLDERS = ["Curriculum", "Lessons", "Activities", "Assessments"];

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const token = session.accessToken;

  const result: Record<string, string> = {};

  // ── Root folder ───
  const root = await findOrCreateFolder(token, "AI Teacher");
  result["root"] = root.id;

  // ── Standards folder ───
  const standards = await findOrCreateFolder(token, "Standards", root.id);
  result["standards"] = standards.id;

  // ── Grade folders with year plan and quarters ───
  for (const grade of GRADES) {
    const gradeName = `Grade ${grade} English`;
    const gradeFolder = await findOrCreateFolder(token, gradeName, root.id);
    result[`grade_${grade}`] = gradeFolder.id;

    // Year Plan folder at grade root — full-year overview, pacing, standards map
    const yearPlan = await findOrCreateFolder(
      token,
      "Year Plan",
      gradeFolder.id
    );
    result[`grade_${grade}_YearPlan`] = yearPlan.id;

    for (const quarter of QUARTERS) {
      const quarterFolder = await findOrCreateFolder(
        token,
        quarter,
        gradeFolder.id
      );
      result[`grade_${grade}_${quarter}`] = quarterFolder.id;

      for (const sub of UNIT_SUBFOLDERS) {
        const subFolder = await findOrCreateFolder(
          token,
          sub,
          quarterFolder.id
        );
        result[`grade_${grade}_${quarter}_${sub}`] = subFolder.id;
      }
    }
  }

  return Response.json({
    message: "Drive folder structure created",
    folders: result,
  });
}
