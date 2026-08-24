// What a folder tree MEANS, declared by the person importing rather than
// guessed by the scanner.
//
// The app used to infer structure from folder depth, with one rule baked into
// the scanner: "the first folder below the root is a unit." That rule is right
// for one shape of Drive and wrong for every other, and when it was wrong it
// failed silently — a sub-project folder became a top-level unit, or a whole
// unit vanished because its name sat one level higher than the scanner looked.
//
// So the teacher tells us instead. A LevelMap is an ordered list of what each
// folder depth means, starting with the folder she selected:
//
//   ["year", "quarter", "unit"]   the folder is a year; its children are
//                                 quarters; their children are units
//   ["quarter", "unit"]           the folder is one quarter of units
//   ["unit"]                      the folder IS one unit, whole subtree
//   ["container", "unit"]         the folder is just a bag; children are units
//   ["container"]                 no structure at all; every file is material
//
// Anything deeper than the map is flat: her folder structure below the unit is
// not consistent (confirmed 2026-08-24), so the app reads no meaning into it.
// Lessons are found at FILE level, not by folder — a lesson is a file, usually
// a PowerPoint (see the `lesson-entity` glossary term).

import type { ScannedNode } from "./drive";

export const LEVEL_KINDS = [
  "grade",
  "year",
  "quarter",
  "unit",
  "container",
] as const;

export type LevelKind = (typeof LEVEL_KINDS)[number];

/** Index 0 describes the selected folder itself, 1 its children, and so on. */
export type LevelMap = LevelKind[];

// Curricular nesting order. `container` is a wildcard — "this level carries no
// meaning, pass through it" — so it is excluded from the ordering check.
const RANK: Record<Exclude<LevelKind, "container">, number> = {
  grade: 0,
  year: 1,
  quarter: 2,
  unit: 3,
};

export const CANONICAL_QUARTERS = [
  "Summer",
  "Q1",
  "Q2",
  "Q3",
  "Q4",
  "YearPlan",
] as const;
export type CanonicalQuarter = (typeof CANONICAL_QUARTERS)[number];

// Words that carry no meaning of their own in a folder name, so their presence
// does not stop a name from being "just a quarter".
const NOISE = /\b(grade\s*\d+|grade|reading|ela|english|materials?|docs?|folder|plan|guide)\b/g;

/**
 * The quarter a name MENTIONS, wherever it appears. "Dash Q3" -> "Q3".
 *
 * This is a tag, not an identity: her unit folders are named for the book and
 * suffixed with the quarter she teaches it in, which is a free and faithful
 * quarter assignment for that unit.
 */
export function quarterTagIn(name: string): CanonicalQuarter | null {
  const s = name.trim().toLowerCase();
  if (/\bsummer\b/.test(s)) return "Summer";
  if (/\byear\s*[-_ ]?plan\b|\bpacing\s*guide\b|\byearlong\b/.test(s)) return "YearPlan";
  const m =
    s.match(/\bq\s*([1-4])\b/) ??
    s.match(/\bquarter\s*([1-4])\b/) ??
    s.match(/\b([1-4])(?:st|nd|rd|th)\s*quarter\b/);
  return m ? (`Q${m[1]}` as CanonicalQuarter) : null;
}

/**
 * The quarter a name IS — null unless the name is nothing but a quarter.
 *
 * "Q1", "Quarter 2", "Grade 7 Q1" and "Summer Reading" are quarters. "Dash Q3"
 * and "Refugee Q4" are NOT: strip the quarter token and a real name is left
 * over, which means the folder is a unit that mentions its quarter.
 *
 * Getting this wrong is not cosmetic. Reading every unit folder as a quarter
 * produced "8 of 8 subfolders read as quarters" against a Grade 6 folder that
 * contained eight units and no quarter folders at all.
 */
export function normalizeQuarter(name: string): CanonicalQuarter | null {
  const tag = quarterTagIn(name);
  if (!tag) return null;

  const remainder = name
    .trim()
    .toLowerCase()
    // Remove whichever quarter phrase matched.
    .replace(/\bsummer\b/g, " ")
    .replace(/\byear\s*[-_ ]?plan\b|\bpacing\s*guide\b|\byearlong\b/g, " ")
    .replace(/\bq\s*[1-4]\b/g, " ")
    .replace(/\bquarter\s*[1-4]\b/g, " ")
    .replace(/\b[1-4](?:st|nd|rd|th)\s*quarter\b/g, " ")
    .replace(/\bquarter\b/g, " ")
    .replace(NOISE, " ")
    .replace(/[^a-z0-9]+/g, "");

  return remainder === "" ? tag : null;
}

export type LevelMapError = { code: string; message: string };

/**
 * A level map is valid when it is non-empty, uses known kinds, and its
 * curricular levels only ever go deeper — a unit cannot contain a quarter.
 */
export function validateLevelMap(levels: LevelMap): LevelMapError[] {
  const errors: LevelMapError[] = [];
  if (!levels.length) {
    errors.push({
      code: "empty",
      message: "Say what the folder you picked is, even if it is just a container.",
    });
    return errors;
  }

  for (const level of levels) {
    if (!LEVEL_KINDS.includes(level)) {
      errors.push({ code: "unknown_kind", message: `"${level}" is not a level.` });
    }
  }
  if (errors.length) return errors;

  let previous = -1;
  let previousName = "";
  for (const level of levels) {
    if (level === "container") continue;
    const rank = RANK[level as Exclude<LevelKind, "container">];
    if (rank <= previous) {
      errors.push({
        code: "not_nested",
        message: `A ${previousName} cannot contain a ${level}.`,
      });
      break;
    }
    previous = rank;
    previousName = level;
  }
  return errors;
}

export type PlannedMaterial = {
  fileId: string;
  name: string;
  mimeType: string;
  /** Canonical quarter this file sits under, or null if the map declares none. */
  quarter: CanonicalQuarter | null;
  /** The teacher's own unit name, or null outside any unit. */
  unit: string | null;
  /** Folder names from the selected folder down to this file, for provenance. */
  path: string[];
};

export type PlacementPlan = {
  materials: PlannedMaterial[];
  /** Distinct unit names in the order the tree presents them. */
  units: string[];
  quarters: CanonicalQuarter[];
  /** Things the teacher should see before committing — never thrown away silently. */
  warnings: string[];
};

/**
 * Apply a declared level map to a scanned tree.
 *
 * Pure: no Drive, no database, no AI. Everything structural about an import is
 * decided here, which is what makes it testable against a mocked tree.
 */
export function applyLevelMap(
  root: ScannedNode,
  levels: LevelMap
): PlacementPlan {
  const errors = validateLevelMap(levels);
  if (errors.length) {
    throw new Error(`invalid level map: ${errors.map((e) => e.message).join(" ")}`);
  }

  const materials: PlannedMaterial[] = [];
  const units: string[] = [];
  const quarters: CanonicalQuarter[] = [];
  const warnings: string[] = [];

  function record<T>(list: T[], value: T) {
    if (!list.includes(value)) list.push(value);
  }

  function walk(
    node: ScannedNode,
    depth: number,
    ctx: { quarter: CanonicalQuarter | null; unit: string | null },
    path: string[]
  ) {
    // Beyond the declared map, folders carry no meaning — inherit and flatten.
    const kind: LevelKind | null = levels[depth] ?? null;
    const next = { ...ctx };

    if (kind === "quarter") {
      const q = normalizeQuarter(node.name);
      if (q) {
        next.quarter = q;
        record(quarters, q);
      } else {
        warnings.push(
          `"${node.name}" is marked as a quarter but does not read as one — its files will have no quarter.`
        );
      }
    } else if (kind === "unit") {
      const unitName = node.name.trim();
      if (unitName) {
        next.unit = unitName;
        record(units, unitName);
        // She names unit folders for the book and suffixes the quarter she
        // teaches it in ("Dash Q3"). If no quarter level was declared above,
        // that suffix IS her quarter — reading it costs nothing and is more
        // faithful than leaving the unit unplaced.
        if (!next.quarter) {
          const tagged = quarterTagIn(unitName);
          if (tagged) {
            next.quarter = tagged;
            record(quarters, tagged);
          }
        }
      }
    }

    for (const child of node.children) {
      if (child.isFolder) {
        walk(child, depth + 1, next, [...path, child.name]);
      } else {
        materials.push({
          fileId: child.id,
          name: child.name,
          mimeType: child.mimeType,
          quarter: next.quarter,
          unit: next.unit,
          path,
        });
      }
    }
  }

  walk(root, 0, { quarter: null, unit: null }, []);

  const declaresUnits = levels.includes("unit");
  const orphans = materials.filter((m) => !m.unit).length;
  if (declaresUnits && orphans) {
    warnings.push(
      `${orphans} file${orphans === 1 ? "" : "s"} sit outside any unit and will land in the pool.`
    );
  }

  return { materials, units, quarters, warnings };
}

export type LevelMapProposal = {
  levels: LevelMap;
  reason: string;
  /** Other readings of the same tree, offered rather than hidden. */
  alternatives: { levels: LevelMap; reason: string }[];
};

/**
 * Guess a level map from the tree's own shape, as a starting point the teacher
 * corrects — capture, infer, correct. Where the tree is genuinely ambiguous
 * this leans COARSER (fewer units), because the verified failure mode is the
 * app producing more units than she wanted and her spending a session merging
 * them back together.
 */
export function proposeLevelMap(root: ScannedNode): LevelMapProposal {
  const folders = root.children.filter((c) => c.isFolder);

  if (!folders.length) {
    return {
      levels: ["container"],
      reason: "No subfolders — every file here is just material.",
      alternatives: [{ levels: ["unit"], reason: "Treat this folder as one unit." }],
    };
  }

  // A folder is a quarter only if its name is nothing BUT a quarter, and only
  // if the set of them behaves like quarters: at most six exist (Summer, Q1-Q4,
  // YearPlan) and no two are the same one. Eight folders claiming to be
  // quarters are eight units that mention their quarter.
  const quarterNames = folders.map((f) => normalizeQuarter(f.name)).filter(Boolean);
  const distinctQuarters = new Set(quarterNames);
  const looksLikeQuarters =
    quarterNames.length >= Math.ceil(folders.length / 2) &&
    distinctQuarters.size === quarterNames.length &&
    distinctQuarters.size <= CANONICAL_QUARTERS.length;

  if (looksLikeQuarters) {
    return {
      levels: ["year", "quarter", "unit"],
      reason: `${quarterNames.length} of ${folders.length} subfolders are named for a quarter, so this looks like a whole year.`,
      alternatives: [
        {
          levels: ["container", "quarter", "unit"],
          reason: "Same shape, but do not treat the folder itself as a school year.",
        },
      ],
    };
  }

  // Folders named for a book with a quarter suffix — "Dash Q3", "Refugee Q4".
  // These are units, and the suffix tells us which quarter each belongs to.
  const tagged = folders.filter((f) => quarterTagIn(f.name)).length;
  if (tagged >= Math.ceil(folders.length / 2)) {
    return {
      levels: ["container", "unit"],
      reason: `${tagged} of ${folders.length} subfolders are named for something with a quarter after it, so each one is a unit and its quarter comes from its name.`,
      alternatives: [{ levels: ["unit"], reason: "Treat the whole folder as one unit." }],
    };
  }

  if (normalizeQuarter(root.name)) {
    return {
      levels: ["quarter", "unit"],
      reason: `"${root.name}" reads as a quarter, so its subfolders are units.`,
      alternatives: [{ levels: ["unit"], reason: "Treat the whole quarter as a single unit." }],
    };
  }

  // The genuinely ambiguous case: subfolders could be units, or they could be
  // organisation inside one unit. Nothing in the tree distinguishes them, so
  // take the coarser reading and show the other one plainly.
  return {
    levels: ["unit"],
    reason:
      "Cannot tell whether the subfolders are units or organisation inside one unit — assuming one unit, which is the safer mistake to correct.",
    alternatives: [
      {
        levels: ["container", "unit"],
        reason: `Each of the ${folders.length} subfolders is its own unit.`,
      },
    ],
  };
}
