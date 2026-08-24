// Where a material sits in the curriculum — one definition, used by every
// read path.
//
// There are two answers in the database right now, and there will be for as
// long as pre-rebuild rows survive:
//
//   NEW  materials.course_id / .quarter / .category — placement as data
//   OLD  drive_folders.folder_key ("grade_7_Q2_Lessons") — placement encoded
//        into the path of a folder the app copied her file into
//
// The new columns win where they are set. The old derivation is kept as a
// fallback rather than deleted, so restoring a pre-rebuild backup does not
// leave the app reading empty columns and showing the teacher nothing.

export type FolderKeyParts = {
  grade: number;
  quarter: string;
  category: string;
};

/** "grade_7_Q2_Lessons" -> { grade: 7, quarter: "Q2", category: "Lessons" } */
export function parseFolderKey(folderKey: string | null): FolderKeyParts | null {
  if (!folderKey) return null;
  const parts = folderKey.split("_");
  if (parts[0] !== "grade") return null;
  const grade = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(grade)) return null;
  return {
    grade,
    quarter: parts[2] ?? "Other",
    category: parts[3] ?? "Uncategorized",
  };
}

export type PlacementInput = {
  /** Set when the material was imported by the plan pipeline. */
  courseId?: string | null;
  quarter?: string | null;
  category?: string | null;
  /** courses.grade for courseId, joined by the caller. */
  courseGrade?: number | null;
  /** Legacy fallback. */
  folderKey?: string | null;
};

export type Placement = {
  grade: number | null;
  quarter: string;
  category: string;
  /** True when this came from placement columns rather than a folder path. */
  placed: boolean;
};

export function derivePlacement(row: PlacementInput): Placement {
  if (row.courseId) {
    return {
      grade: row.courseGrade ?? null,
      quarter: row.quarter ?? "Other",
      category: row.category ?? "Uncategorized",
      placed: true,
    };
  }

  const parsed = parseFolderKey(row.folderKey ?? null);
  return {
    grade: parsed?.grade ?? null,
    quarter: parsed?.quarter ?? "Other",
    category: parsed?.category ?? "Uncategorized",
    placed: false,
  };
}
