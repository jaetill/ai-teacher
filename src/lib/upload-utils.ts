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
] as const;
export type Category = (typeof CATEGORIES)[number];

export const DESTINATIONS = [
  "Q1",
  "Q2",
  "Q3",
  "Q4",
  "YearPlan",
] as const;
export type Destination = (typeof DESTINATIONS)[number];

export const MATERIAL_TYPES = [
  "presentation",
  "worksheet",
  "reading",
  "rubric",
  "answer_key",
  "handout",
  "other",
] as const;
export type MaterialType = (typeof MATERIAL_TYPES)[number];

export const GRADES = [6, 7, 8] as const;
