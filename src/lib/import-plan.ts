// An import, described as data.
//
// The old import fused three decisions into one folder path: what a file is,
// where it belongs, and where it is stored. `grade_7_Q2_Lessons` was
// simultaneously the Drive location, the curriculum placement, and the reason
// a build had to run one quarter at a time. An ImportPlan separates them:
//
//   source   what am I pointing at   a Drive folder, or a single Drive file
//   levels   what is its structure   the LevelMap the teacher declares
//   target   where does it belong    school year -> grade -> track (-> quarter)
//
// Source and levels are answered before target is chosen, which is the order
// the teacher actually thinks in: "this is a unit" comes before "put it in
// last year's Grade 7."
//
// Materials are recorded by REFERENCE — her own Drive file id, in place. The
// app no longer copies files into a tree it owns, so nothing duplicates and
// nothing goes stale when she edits her original. Referencing is also
// read-only against her Drive, which is the safer failure mode.

import { and, eq, inArray, isNull } from "drizzle-orm";
import { db as database } from "@/db";
import { courses, materials } from "@/db/schema";
import {
  applyLevelMap,
  validateLevelMap,
  type CanonicalQuarter,
  type LevelMap,
  type PlannedMaterial,
} from "./import-structure";
import type { ScannedNode } from "./drive";
import { CATEGORIES, MATERIAL_TYPES } from "./upload-utils";
import { inferCategoryFromPath, inferMaterialType } from "./import-classify";

// Re-exported so the plan module stays the single import site for anything
// about an import, while the browser can pull the same logic from
// import-classify without dragging the database in.
export { inferCategoryFromPath, inferMaterialType };
import { isUuid } from "./api-utils";

export const MAX_PLAN_FILES = 500;

export type ImportSource =
  | { kind: "drive-folder"; folderId: string }
  | { kind: "drive-file"; fileId: string };

export type ImportTarget = {
  grade: number;
  /** Omit for the current school year; null means a course with no year. */
  schoolYearId?: string | null;
  subject?: string;
  /** "honors" / "regular"; null or omitted means the grade is untracked. */
  track?: string | null;
  /**
   * Quarter for files the level map left without one. It is a fallback, not an
   * override — a map that resolved a quarter always wins, because that came
   * from her folders.
   */
  defaultQuarter?: CanonicalQuarter | null;
  /**
   * Quarter the teacher stated outright, which beats everything.
   *
   * The hierarchy is grade > year > quarter > unit, and the import screen makes
   * her say where in it the thing she pointed at belongs. When she picks a
   * quarter by hand she is answering "what does this unit belong to", and that
   * answer outranks a quarter guessed from a folder name — she is the one who
   * knows.
   */
  overrideQuarter?: CanonicalQuarter | null;
};

/** Per-file corrections from the review table: classification and opt-out. */
export type FileOverride = {
  fileId: string;
  category?: string | null;
  materialType?: string | null;
  include?: boolean;
};

export type ImportPlan = {
  source: ImportSource;
  levels: LevelMap;
  target: ImportTarget;
  files?: FileOverride[];
};

export type PlanError = { field: string; message: string };

export function validateImportPlan(plan: unknown): PlanError[] {
  const errors: PlanError[] = [];
  const p = plan as Partial<ImportPlan> | null;
  if (!p || typeof p !== "object") {
    return [{ field: "body", message: "Expected an import plan object." }];
  }

  const source = p.source;
  if (!source || typeof source !== "object") {
    errors.push({ field: "source", message: "source is required." });
  } else if (source.kind === "drive-folder") {
    if (!source.folderId?.trim())
      errors.push({ field: "source.folderId", message: "folderId is required." });
  } else if (source.kind === "drive-file") {
    if (!source.fileId?.trim())
      errors.push({ field: "source.fileId", message: "fileId is required." });
  } else {
    errors.push({ field: "source.kind", message: "Unknown source kind." });
  }

  if (!Array.isArray(p.levels)) {
    errors.push({ field: "levels", message: "levels is required." });
  } else {
    for (const e of validateLevelMap(p.levels)) {
      errors.push({ field: "levels", message: e.message });
    }
  }

  const t = p.target;
  if (!t || typeof t !== "object") {
    errors.push({ field: "target", message: "target is required." });
  } else {
    if (!Number.isInteger(t.grade) || t.grade < 1 || t.grade > 12) {
      errors.push({ field: "target.grade", message: "grade must be 1-12." });
    }
    if (t.schoolYearId != null && !isUuid(t.schoolYearId)) {
      errors.push({ field: "target.schoolYearId", message: "schoolYearId must be a UUID." });
    }
    if (t.track != null && (typeof t.track !== "string" || t.track.length > 50)) {
      errors.push({ field: "target.track", message: "track must be a short string." });
    }
    if (t.subject != null && (typeof t.subject !== "string" || t.subject.length > 50)) {
      errors.push({ field: "target.subject", message: "subject must be a short string." });
    }
  }

  if (p.files != null) {
    if (!Array.isArray(p.files)) {
      errors.push({ field: "files", message: "files must be an array." });
    } else if (p.files.length > MAX_PLAN_FILES) {
      errors.push({ field: "files", message: `Too many file overrides (max ${MAX_PLAN_FILES}).` });
    } else {
      for (const f of p.files) {
        if (!f?.fileId) {
          errors.push({ field: "files", message: "Each override needs a fileId." });
          break;
        }
        if (f.category != null && !(CATEGORIES as readonly string[]).includes(f.category)) {
          errors.push({ field: "files", message: `Unknown category "${f.category}".` });
          break;
        }
        if (
          f.materialType != null &&
          !(MATERIAL_TYPES as readonly string[]).includes(f.materialType)
        ) {
          errors.push({ field: "files", message: `Unknown material type "${f.materialType}".` });
          break;
        }
      }
    }
  }

  return errors;
}

/** One material as it will be written, after the plan and overrides are applied. */
export type ResolvedMaterial = {
  driveFileId: string;
  title: string;
  driveMimeType: string;
  quarter: CanonicalQuarter | null;
  sourceUnit: string | null;
  category: string | null;
  materialType: string;
  path: string[];
};

/**
 * Fold per-file overrides and the target's default quarter into the structural
 * plan. Pure — no Drive, no database.
 */
export function resolvePlanMaterials(
  planned: PlannedMaterial[],
  target: ImportTarget,
  overrides: FileOverride[] = []
): ResolvedMaterial[] {
  const byId = new Map(overrides.map((o) => [o.fileId, o]));

  return planned
    .filter((m) => byId.get(m.fileId)?.include !== false)
    .map((m) => {
      const o = byId.get(m.fileId);
      // Her correction, then her folder names, then nothing. Never a guess
      // dressed up as a fact.
      const category = o?.category ?? inferCategoryFromPath(m.path);
      return {
        driveFileId: m.fileId,
        title: m.name,
        driveMimeType: m.mimeType,
        // What she said outright, then what her folders say, then the
        // gap-filler. She outranks her own folder names; both outrank a guess.
        quarter: target.overrideQuarter ?? m.quarter ?? target.defaultQuarter ?? null,
        sourceUnit: m.unit,
        category,
        materialType: o?.materialType ?? inferMaterialType(category, m.mimeType),
        path: m.path,
      };
    });
}

export type ResolvedCourse = { id: string; created: boolean };

/**
 * Find the course the plan targets, creating it only when asked to.
 *
 * Select-before-insert, and NULL-aware on both track and school year: with
 * plain equality a NULL track never matches, so every import would create a
 * fresh course and fracture the units across duplicates (#eval-2026-07 saw
 * exactly that with school_year_id).
 */
export async function resolveTargetCourse(
  target: ImportTarget,
  ownerEmail: string,
  opts: { create?: boolean; db?: typeof database } = {}
): Promise<ResolvedCourse | null> {
  const db = opts.db ?? database;
  const subject = target.subject ?? "ELA";
  const track = target.track ?? null;
  const schoolYearId = target.schoolYearId ?? null;

  const where = and(
    eq(courses.grade, target.grade),
    eq(courses.subject, subject),
    track === null ? isNull(courses.track) : eq(courses.track, track),
    schoolYearId === null
      ? isNull(courses.schoolYearId)
      : eq(courses.schoolYearId, schoolYearId),
    eq(courses.ownerEmail, ownerEmail)
  );

  const [existing] = await db.select({ id: courses.id }).from(courses).where(where).limit(1);
  if (existing) return { id: existing.id, created: false };
  if (!opts.create) return null;

  const suffix = track ? ` (${track})` : "";
  const [inserted] = await db
    .insert(courses)
    .values({
      title: `Grade ${target.grade} English Language Arts${suffix}`,
      grade: target.grade,
      subject,
      track,
      schoolYearId,
      ownerEmail,
    })
    .onConflictDoNothing()
    .returning({ id: courses.id });

  if (inserted) return { id: inserted.id, created: true };

  // Lost a concurrent-create race; the row exists now.
  const [raced] = await db.select({ id: courses.id }).from(courses).where(where).limit(1);
  return raced ? { id: raced.id, created: false } : null;
}

export type CommitResult = {
  courseId: string;
  courseCreated: boolean;
  created: number;
  updated: number;
  total: number;
};

/**
 * Write the resolved materials against a course, by reference.
 *
 * Re-importing the same folder updates placement in place instead of
 * duplicating: dedupe is on (driveFileId, courseId). Two things are
 * deliberately NOT touched on an update — the AI `description`, which is
 * expensive to recompute, and `material_attachments`, which is where her
 * drag-and-drop lesson placements live. An import reconciles around her work,
 * never over it.
 *
 * Dedupe is enforced here rather than by a unique constraint because
 * driveFileId is nullable (url/inline materials) and a NULLS NOT DISTINCT
 * constraint would collide those rows with each other.
 */
export async function commitPlanMaterials(
  resolved: ResolvedMaterial[],
  courseId: string,
  ownerEmail: string,
  opts: { db?: typeof database } = {}
): Promise<{ created: number; updated: number }> {
  const db = opts.db ?? database;
  if (!resolved.length) return { created: 0, updated: 0 };

  const ids = resolved.map((m) => m.driveFileId);
  const existing = ids.length
    ? await db
        .select({ id: materials.id, driveFileId: materials.driveFileId })
        .from(materials)
        .where(and(eq(materials.courseId, courseId), inArray(materials.driveFileId, ids)))
    : [];
  const existingByFile = new Map(existing.map((r) => [r.driveFileId!, r.id]));

  const inserts = [];
  let updated = 0;

  for (const m of resolved) {
    const known = existingByFile.get(m.driveFileId);
    const row = {
      title: m.title,
      materialType: m.materialType,
      storageType: "google_drive" as const,
      driveFileId: m.driveFileId,
      driveMimeType: m.driveMimeType,
      driveWebUrl: `https://drive.google.com/file/d/${m.driveFileId}/view`,
      // No folder of ours holds this file — it stays where she put it.
      driveFolderId: null,
      sourceUnit: m.sourceUnit,
      courseId,
      quarter: m.quarter,
      category: m.category,
      source: "human" as const,
      ownerEmail,
    };

    if (known) {
      await db
        .update(materials)
        .set({ ...row, updatedAt: new Date() })
        .where(eq(materials.id, known));
      updated++;
    } else {
      inserts.push(row);
    }
  }

  if (inserts.length) await db.insert(materials).values(inserts);
  return { created: inserts.length, updated };
}

/** Everything a plan would do, computed without writing anything. */
export type PlanPreview = {
  levels: LevelMap;
  units: string[];
  quarters: CanonicalQuarter[];
  materials: ResolvedMaterial[];
  warnings: string[];
};

export function previewPlan(root: ScannedNode, plan: ImportPlan): PlanPreview {
  const placement = applyLevelMap(root, plan.levels);
  const resolved = resolvePlanMaterials(placement.materials, plan.target, plan.files);
  const warnings = [...placement.warnings];

  if (resolved.length > MAX_PLAN_FILES) {
    warnings.push(
      `${resolved.length} files is more than one import should carry (max ${MAX_PLAN_FILES}) — narrow the folder or the level map.`
    );
  }

  return {
    levels: plan.levels,
    units: placement.units,
    quarters: placement.quarters,
    materials: resolved,
    warnings,
  };
}
