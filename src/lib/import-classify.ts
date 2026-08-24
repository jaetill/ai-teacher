// Category and material type, guessed from her own folder names.
//
// Split out of import-plan.ts so the browser can run it too: the import screen
// shows what the classification will be before she commits, and the plan
// endpoint computes the same answer server-side. One implementation, two
// callers, no drift. (import-plan.ts imports the database, so a client
// component cannot pull it in.)

import { CATEGORIES } from "./upload-utils";

/**
 * Read a category out of the folders a file sits in.
 *
 * Her subfolders are already named Lessons / Assessments / Activities /
 * Resources / Curriculum, so the category is sitting there in the path for
 * free. Using it means the common import needs no AI classification pass —
 * "be faithful as deep as her folders go" applied to the one level below the
 * unit that IS consistent.
 *
 * Deepest match wins: "The Giver/Assessments/Retakes" is Assessments.
 */
export function inferCategoryFromPath(path: string[]): string | null {
  for (let i = path.length - 1; i >= 0; i--) {
    const match = (CATEGORIES as readonly string[]).find(
      (c) => c.toLowerCase() === path[i].trim().toLowerCase()
    );
    if (match) return match;
  }
  return null;
}

const TYPE_BY_CATEGORY: Record<string, string> = {
  Lessons: "lesson",
  Assessments: "assessment",
  Activities: "activity",
  Resources: "resource",
  Curriculum: "curriculum",
};

const DECK_MIMES = new Set([
  "application/vnd.google-apps.presentation",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
]);

/**
 * Best guess at material type, cheaply. Category wins over file kind: a slide
 * deck filed under Assessments is an assessment, not a lesson.
 */
export function inferMaterialType(category: string | null, mimeType: string): string {
  if (category && TYPE_BY_CATEGORY[category]) return TYPE_BY_CATEGORY[category];
  // A lesson is a file, usually a PowerPoint (glossary: lesson-entity).
  if (DECK_MIMES.has(mimeType)) return "lesson";
  return "other";
}
