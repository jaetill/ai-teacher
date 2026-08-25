"use client";

// One screen. Point at a folder, say what it is and where it goes, import.
//
// The first version was four stepped panels and it was tedious: the teacher
// had to walk a wizard to do something she already knew the answer to before
// she started. Everything now lives on one screen, the structure is a single
// dropdown rather than a per-depth grid, and the only thing between her and
// the import button is a chance to fix classifications that came out wrong.
//
// The whole preview is computed in the browser. applyLevelMap is pure, so
// every control re-derives units, quarters and categories instantly.

import { useMemo, useState } from "react";
import type { ScannedNode } from "@/lib/drive";
import {
  applyLevelMap,
  type LevelMap,
  type LevelMapProposal,
} from "@/lib/import-structure";
import { inferCategoryFromPath, inferMaterialType } from "@/lib/import-classify";
import { CATEGORIES } from "@/lib/upload-utils";

// The hierarchy the app actually stores, stated out loud rather than left for
// her to infer: a grade has school years, a year has quarters, a quarter has
// units, a unit has files. She says which rung she is pointing at, and then
// what it belongs to — the rungs above it.
//
// `needs` is the parent chain to ask for. Pointing at a unit needs a quarter, a
// year and a grade; pointing at a whole year only needs a grade.
const SHAPES: {
  id: string;
  label: string;
  levels: LevelMap;
  needsQuarter: boolean;
}[] = [
  { id: "unit", label: "One unit", levels: ["unit"], needsQuarter: true },
  { id: "units", label: "Several units", levels: ["container", "unit"], needsQuarter: true },
  {
    id: "quarter",
    label: "One quarter (holding units)",
    levels: ["quarter", "unit"],
    needsQuarter: false,
  },
  {
    id: "year",
    label: "One school year (holding quarters)",
    levels: ["year", "quarter", "unit"],
    needsQuarter: false,
  },
  { id: "files", label: "Just files — no units", levels: ["container"], needsQuarter: true },
];

const QUARTERS = ["Summer", "Q1", "Q2", "Q3", "Q4", "YearPlan"] as const;

/** Quarter comes from each folder's own name rather than from one choice. */
const FROM_FOLDER_NAMES = "__auto__";

function shapeIdFor(levels: LevelMap): string {
  const key = levels.join(">");
  return SHAPES.find((s) => s.levels.join(">") === key)?.id ?? "units";
}

type SourceKind = "drive-folder" | "drive-file";

type ScanResponse = {
  tree: ScannedNode;
  proposal: LevelMapProposal;
  fileCount: number;
  folderCount: number;
};

type Targets = {
  schoolYears: { id: string; name: string; isCurrent: boolean }[];
  courses: { id: string; grade: number; track: string | null; schoolYearId: string | null }[];
  currentSchoolYearId: string | null;
};

type ImportResult = {
  created: number;
  updated: number;
  total: number;
  courseCreated: boolean;
  unitsCreated: number;
  unitsReused: number;
  units: string[];
  warnings: string[];
  courseId: string;
};

/** Accepts a full Drive URL or a bare id. */
export function extractDriveId(input: string): string {
  const s = input.trim();
  const m =
    s.match(/\/folders\/([A-Za-z0-9_-]+)/) ??
    s.match(/\/d\/([A-Za-z0-9_-]+)/) ??
    s.match(/[?&]id=([A-Za-z0-9_-]+)/);
  return m ? m[1] : s;
}

export default function ImportPlanner() {
  const [sourceKind, setSourceKind] = useState<SourceKind>("drive-folder");
  const [sourceInput, setSourceInput] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [shapeId, setShapeId] = useState("units");
  const [error, setError] = useState<string | null>(null);

  const [targets, setTargets] = useState<Targets | null>(null);
  const [schoolYearId, setSchoolYearId] = useState("");
  const [grade, setGrade] = useState(7);
  const [track, setTrack] = useState("");
  const [quarterChoice, setQuarterChoice] = useState<string>(FROM_FOLDER_NAMES);

  const [overrides, setOverrides] = useState<Record<string, string>>({});
  // What the model worked out for files her folders said nothing about. Kept
  // apart from `overrides` so the fix-up list can lead with the guesses.
  const [guesses, setGuesses] = useState<Record<string, string>>({});
  const [classifying, setClassifying] = useState(false);
  const [showFixes, setShowFixes] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const shape = SHAPES.find((s) => s.id === shapeId)!;
  const levels = shape.levels;

  const placement = useMemo(() => {
    if (!scan) return null;
    try {
      return applyLevelMap(scan.tree, levels);
    } catch {
      return null;
    }
  }, [scan, levels]);

  // Did her folder names answer the quarter question for us? If so, offering
  // "from the folder names" is both the faithful default and one fewer choice.
  const foldersNameTheirQuarter = Boolean(placement && placement.quarters.length > 0);
  const overrideQuarter =
    shape.needsQuarter && quarterChoice && quarterChoice !== FROM_FOLDER_NAMES
      ? quarterChoice
      : null;

  /** Same inference the server will run, so what she sees is what gets written. */
  const classified = useMemo(() => {
    if (!placement) return [];
    return placement.materials.map((m) => {
      // Her correction, then her folder names, then the model. Certainty
      // first: a guess never displaces something she actually told us.
      const fromFolder = inferCategoryFromPath(m.path);
      const category = overrides[m.fileId] ?? fromFolder ?? guesses[m.fileId] ?? null;
      return {
        fileId: m.fileId,
        name: m.name,
        unit: m.unit,
        // Mirrors the server's precedence exactly: her stated answer, then her
        // folder names, then nothing.
        quarter: overrideQuarter ?? m.quarter ?? null,
        category,
        materialType: inferMaterialType(category, m.mimeType),
        // True when nothing but the model's reading of the filename put it here.
        guessed: !overrides[m.fileId] && !fromFolder && Boolean(guesses[m.fileId]),
      };
    });
  }, [placement, overrides, guesses, overrideQuarter]);

  const byCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of classified) counts[c.category ?? "Unclassified"] = (counts[c.category ?? "Unclassified"] ?? 0) + 1;
    return counts;
  }, [classified]);

  const unclassified = classified.filter((c) => !c.category);
  const guessedCount = classified.filter((c) => c.guessed).length;
  // The fix-up list leads with what nothing could place, then what the model
  // guessed. Anything her folders answered is not up for review.
  const needsAttention = [...unclassified, ...classified.filter((c) => c.guessed)];

  /** The chain she has declared, shown back to her: grade > year > quarter > unit. */
  const breadcrumb = useMemo(() => {
    const year = targets?.schoolYears.find((y) => y.id === schoolYearId)?.name;
    const quarters = [...new Set(classified.map((c) => c.quarter).filter(Boolean))];
    const parts = [`Grade ${grade}${track.trim() ? ` ${track.trim()}` : ""}`];
    if (year) parts.push(year);
    parts.push(quarters.length ? quarters.join(", ") : "no quarter");
    if (placement?.units.length) {
      parts.push(`${placement.units.length} unit${placement.units.length === 1 ? "" : "s"}`);
    }
    parts.push(`${classified.length} file${classified.length === 1 ? "" : "s"}`);
    return parts;
  }, [grade, track, targets, schoolYearId, classified, placement]);

  async function runScan(raw: string) {
    const id = extractDriveId(raw);
    if (!id) return;
    setScanning(true);
    setError(null);
    setResult(null);
    setOverrides({});
    setGuesses({});
    try {
      const param = sourceKind === "drive-folder" ? "folderId" : "fileId";
      const [scanRes, targetRes] = await Promise.all([
        fetch(`/api/import/scan?${param}=${encodeURIComponent(id)}`),
        targets ? Promise.resolve(null) : fetch("/api/import/targets"),
      ]);

      if (!scanRes.ok) {
        setError((await scanRes.json()).error ?? "Could not read that folder.");
        setScan(null);
        return;
      }
      const data: ScanResponse = await scanRes.json();
      setScan(data);
      setShapeId(shapeIdFor(data.proposal.levels));
      // Part of the same motion — she should not have to ask for this.
      void classifyLeftovers(data.tree, data.proposal.levels);

      if (targetRes?.ok) {
        const t: Targets = await targetRes.json();
        setTargets(t);
        setSchoolYearId(t.currentSchoolYearId ?? t.schoolYears[0]?.id ?? "");
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setScanning(false);
    }
  }

  /**
   * Ask the model about the files her folders did not classify — and only
   * those. Runs on its own after a scan, because "point at it and import" is
   * one motion and a Classify button would be another chore.
   *
   * Batched, because one request for several hundred filenames truncates its
   * own JSON. Results are merged as each batch lands, so the chips fill in
   * rather than making her wait on the whole set.
   */
  async function classifyLeftovers(tree: ScannedNode, levels: LevelMap) {
    let planned;
    try {
      planned = applyLevelMap(tree, levels).materials;
    } catch {
      return;
    }
    const todo = planned
      .filter((m) => !inferCategoryFromPath(m.path))
      .map((m) => ({ id: m.fileId, name: m.name, unit: m.unit }));
    if (!todo.length) return;

    setClassifying(true);
    try {
      const BATCH = 60;
      for (let i = 0; i < todo.length; i += BATCH) {
        const res = await fetch("/api/import/classify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ files: todo.slice(i, i + BATCH) }),
        });
        if (!res.ok) break; // Leave the rest unclassified; she can still fix them.
        const data: { classifications: { id: string; category: string | null }[] } =
          await res.json();
        const add: Record<string, string> = {};
        for (const c of data.classifications) if (c.category) add[c.id] = c.category;
        setGuesses((g) => ({ ...g, ...add }));
      }
    } catch {
      // A classification failure is not an import failure.
    } finally {
      setClassifying(false);
    }
  }

  async function runImport() {
    if (!scan) return;
    setImporting(true);
    setError(null);
    try {
      const id = extractDriveId(sourceInput);
      const res = await fetch("/api/import/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source:
            sourceKind === "drive-folder"
              ? { kind: "drive-folder", folderId: id }
              : { kind: "drive-file", fileId: id },
          levels,
          target: {
            grade,
            schoolYearId: schoolYearId || null,
            track: track.trim() || null,
            overrideQuarter,
          },
          // Everything whose category did NOT come from a folder path has to
          // travel with the plan — the server re-derives folder categories on
          // its own but cannot re-derive her corrections or the model's
          // guesses, and silently dropping them would lose the whole pass.
          files: classified
            .filter((c) => c.category && (overrides[c.fileId] || c.guessed))
            .map((c) => ({ fileId: c.fileId, category: c.category })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Import failed.");
        return;
      }
      setResult(data);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setImporting(false);
    }
  }

  const card =
    "rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 mb-4";
  const label = "block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1";
  const field =
    "w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100";

  return (
    <div>
      <div className={card}>
        {/* ── Source ─── */}
        <div className="flex gap-1 mb-3">
          {(["drive-folder", "drive-file"] as SourceKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setSourceKind(k)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                sourceKind === k
                  ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                  : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              {k === "drive-folder" ? "A folder" : "A single file"}
            </button>
          ))}
        </div>

        <label className={label} htmlFor="source-input">
          Google Drive link or id
        </label>
        <div className="flex gap-2">
          <input
            id="source-input"
            className={field}
            value={sourceInput}
            placeholder="https://drive.google.com/drive/folders/…"
            onChange={(e) => setSourceInput(e.target.value)}
            onBlur={(e) => e.target.value.trim() && runScan(e.target.value)}
          />
          <button
            type="button"
            onClick={() => runScan(sourceInput)}
            disabled={scanning || !sourceInput.trim()}
            className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 disabled:opacity-40 whitespace-nowrap"
          >
            {scanning ? "Reading…" : "Read it"}
          </button>
        </div>

        {/* ── What it is, and where it goes — same screen, no steps ─── */}
        {scan && placement && (
          <>
            {/* The hierarchy, said out loud. She names the rung she pointed
                at, then the rungs above it. */}
            <p className="mt-5 mb-2 text-xs text-zinc-500 dark:text-zinc-400">
              A <strong>grade</strong> has <strong>school years</strong>, a year has{" "}
              <strong>quarters</strong>, a quarter has <strong>units</strong>, and a unit has your
              files.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={label} htmlFor="shape">
                  What did you point at?
                </label>
                <select
                  id="shape"
                  className={field}
                  value={shapeId}
                  onChange={(e) => setShapeId(e.target.value)}
                >
                  {SHAPES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Parent chain — only the rungs above whatever she picked. */}
              {shape.needsQuarter && (
                <div>
                  <label className={label} htmlFor="quarter">
                    …which belongs to quarter
                  </label>
                  <select
                    id="quarter"
                    className={field}
                    value={quarterChoice}
                    onChange={(e) => setQuarterChoice(e.target.value)}
                  >
                    {foldersNameTheirQuarter && (
                      <option value={FROM_FOLDER_NAMES}>
                        From the folder names ({placement.quarters.join(", ")})
                      </option>
                    )}
                    <option value="">Not sure yet</option>
                    {QUARTERS.map((q) => (
                      <option key={q} value={q}>
                        {q}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className={label} htmlFor="school-year">
                  …which belongs to school year
                </label>
                <select
                  id="school-year"
                  className={field}
                  value={schoolYearId}
                  onChange={(e) => setSchoolYearId(e.target.value)}
                >
                  {(targets?.schoolYears ?? []).map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                      {y.isCurrent ? " (current)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={label} htmlFor="grade">
                  …which is grade
                </label>
                <select
                  id="grade"
                  className={field}
                  value={grade}
                  onChange={(e) => setGrade(Number(e.target.value))}
                >
                  {[6, 7, 8].map((g) => (
                    <option key={g} value={g}>
                      Grade {g}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={label} htmlFor="track">
                  Track <span className="font-normal">(optional)</span>
                </label>
                <input
                  id="track"
                  className={field}
                  value={track}
                  placeholder="honors"
                  onChange={(e) => setTrack(e.target.value)}
                />
              </div>
            </div>

            {/* ── What that works out to ─── */}
            <div className="mt-4 rounded-md border border-zinc-200 dark:border-zinc-800 p-3">
              <p
                data-testid="placement-breadcrumb"
                className="text-sm text-zinc-900 dark:text-zinc-100"
              >
                {breadcrumb.join("  ›  ")}
              </p>
              {placement.units.length > 0 && (
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {placement.units.join(" · ")}
                </p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {Object.entries(byCategory).map(([cat, n]) => (
                  <span
                    key={cat}
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      cat === "Unclassified"
                        ? "bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                    }`}
                  >
                    {cat} {n}
                  </span>
                ))}
                {classifying && (
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    working out the rest…
                  </span>
                )}
                {needsAttention.length > 0 && !classifying && (
                  <button
                    type="button"
                    onClick={() => setShowFixes((v) => !v)}
                    className="text-xs underline text-zinc-600 dark:text-zinc-400"
                  >
                    {showFixes ? "hide" : `check ${needsAttention.length}`}
                  </button>
                )}
              </div>

              {guessedCount > 0 && !classifying && (
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {classified.length - guessedCount - unclassified.length} came from your folder
                  names. {guessedCount}{" "}
                  {guessedCount === 1 ? "was worked out" : "were worked out"} from the filename —
                  worth a glance.
                </p>
              )}

              {placement.warnings.map((w, i) => (
                <p key={i} className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                  {w}
                </p>
              ))}
            </div>

            {/* ── The half-step: fix what came out wrong ─── */}
            {showFixes && needsAttention.length > 0 && (
              <div className="mt-3 rounded-md border border-zinc-200 dark:border-zinc-800 p-3">
                {unclassified.length > 0 && (
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      Set all {unclassified.length} unplaced to
                    </span>
                    <select
                      aria-label="Set all unclassified files to"
                      className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-xs"
                      value=""
                      onChange={(e) => {
                        if (!e.target.value) return;
                        const next = { ...overrides };
                        for (const u of unclassified) next[u.fileId] = e.target.value;
                        setOverrides(next);
                      }}
                    >
                      <option value="">choose…</option>
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <ul className="max-h-72 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800">
                  {needsAttention.map((u) => (
                    <li key={u.fileId} className="flex items-center gap-2 py-1.5">
                      <span className="flex-1 truncate text-xs text-zinc-700 dark:text-zinc-300">
                        {u.name}
                        {u.unit && (
                          <span className="text-zinc-400 dark:text-zinc-500"> — {u.unit}</span>
                        )}
                      </span>
                      {u.guessed && (
                        <span className="text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-400">
                          guess
                        </span>
                      )}
                      <select
                        aria-label={`Category for ${u.name}`}
                        className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-xs"
                        value={overrides[u.fileId] ?? u.category ?? ""}
                        onChange={(e) =>
                          setOverrides({ ...overrides, [u.fileId]: e.target.value })
                        }
                      >
                        <option value="">—</option>
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* ── Import ─── */}
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={runImport}
                disabled={importing || classifying || classified.length === 0}
                className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 disabled:opacity-40"
              >
                {importing
                  ? "Importing…"
                  : classifying
                    ? "Classifying…"
                    : `Import ${classified.length} file${classified.length === 1 ? "" : "s"}`}
              </button>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {(() => {
                  const match = (targets?.courses ?? []).find(
                    (c) =>
                      c.grade === grade &&
                      (c.track ?? null) === (track.trim() || null) &&
                      (c.schoolYearId ?? null) === (schoolYearId || null)
                  );
                  return match
                    ? "Adds to your existing course."
                    : "Creates a new course for this grade and year.";
                })()}{" "}
                Files stay where they are in Drive.
              </span>
            </div>
          </>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-3 mb-4 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-emerald-300 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 p-4 text-sm">
          <p className="text-emerald-800 dark:text-emerald-300">
            Imported {result.total} file{result.total === 1 ? "" : "s"} into{" "}
            {result.unitsCreated} new unit{result.unitsCreated === 1 ? "" : "s"}
            {result.unitsReused > 0 && ` and ${result.unitsReused} you already had`}
            {result.courseCreated ? ", in a new course" : ""}. It is in your curriculum now —
            nothing left to build.
          </p>
          {result.units.length > 0 && (
            <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
              {result.units.join(" · ")}
            </p>
          )}
          <p className="mt-2">
            <a
              href={`/curriculum/edit/${result.courseId}`}
              className="text-sm underline text-emerald-800 dark:text-emerald-300"
            >
              Open the curriculum
            </a>
          </p>
          {result.warnings.map((w, i) => (
            <p key={i} className="mt-1 text-xs text-amber-700 dark:text-amber-400">
              {w}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
