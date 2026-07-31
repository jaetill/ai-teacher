const MIME_MAP: Record<string, string> = {
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".ppt": "application/vnd.ms-powerpoint",
  ".xlsx":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function getMimeType(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return MIME_MAP[ext] ?? "application/octet-stream";
}

/**
 * Build a driveFolders key from grade + destination + category.
 * Examples:
 *   buildFolderKey(8, "Q1", "Lessons")   → "grade_8_Q1_Lessons"
 *   buildFolderKey(8, "YearPlan")         → "grade_8_YearPlan"
 */
export function buildFolderKey(
  grade: number,
  destination: string,
  category?: string
): string {
  if (destination === "YearPlan") {
    return `grade_${grade}_YearPlan`;
  }
  return `grade_${grade}_${destination}_${category}`;
}

export const CATEGORIES = [
  "Curriculum",
  "Lessons",
  "Activities",
  "Assessments",
  "Resources",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const DESTINATIONS = [
  // "Summer" is a pre-year bucket (summer reading), not a graded quarter — it
  // sorts before Q1. Same folder mechanics as a quarter: grade_N_Summer_Category.
  "Summer",
  "Q1",
  "Q2",
  "Q3",
  "Q4",
  "YearPlan",
] as const;
export type Destination = (typeof DESTINATIONS)[number];

// #593: server-side gate for the two values that shape a folder key. YearPlan
// has no category; every other destination requires a known category.
export function isValidFolderTarget(
  destination: unknown,
  category: unknown,
): boolean {
  if (typeof destination !== "string") return false;
  if (!(DESTINATIONS as readonly string[]).includes(destination)) return false;
  if (destination === "YearPlan") return true;
  return (
    typeof category === "string" &&
    (CATEGORIES as readonly string[]).includes(category)
  );
}

export const MATERIAL_TYPES = [
  "reading",
  "activity",
  "rubric",
  "lesson",
  "assessment",
  "resource",
  "curriculum",
  "other",
] as const;
export type MaterialType = (typeof MATERIAL_TYPES)[number];

export const GRADES = [6, 7, 8] as const;
