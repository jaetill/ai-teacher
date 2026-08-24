"use client";

// Import, in the order the teacher actually thinks:
//
//   1. point at something
//   2. say what it IS          (the level map — her structure, declared)
//   3. say where it GOES       (school year -> grade -> track)
//   4. import
//
// Step 2 runs entirely in the browser. applyLevelMap is pure, so changing a
// dropdown re-derives the units and quarters instantly with no round trip —
// she sees what her declaration means while she is making it, which is what
// stops this from being a preview screen bolted on afterwards.

import { useMemo, useState } from "react";
import type { ScannedNode } from "@/lib/drive";
import {
  applyLevelMap,
  validateLevelMap,
  LEVEL_KINDS,
  type LevelKind,
  type LevelMap,
  type LevelMapProposal,
} from "@/lib/import-structure";

const KIND_LABEL: Record<LevelKind, string> = {
  grade: "A grade",
  year: "A school year",
  quarter: "A quarter",
  unit: "A unit",
  container: "Just a folder — no meaning",
};

const DEPTH_LABEL = [
  "The folder you picked is…",
  "Folders inside it are…",
  "Folders one level deeper are…",
  "Folders below that are…",
];

const QUARTERS = ["Summer", "Q1", "Q2", "Q3", "Q4", "YearPlan"] as const;

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
  courseId: string;
  courseCreated: boolean;
  created: number;
  updated: number;
  total: number;
  units: string[];
  warnings: string[];
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

/** How deep the folder nesting actually goes, so we offer no phantom levels. */
export function folderDepth(node: ScannedNode): number {
  const kids = node.children.filter((c) => c.isFolder);
  if (!kids.length) return 0;
  return 1 + Math.max(...kids.map(folderDepth));
}

function Tree({ node, depth = 0 }: { node: ScannedNode; depth?: number }) {
  if (depth > 2) return null;
  const folders = node.children.filter((c) => c.isFolder);
  const files = node.children.filter((c) => !c.isFolder);
  return (
    <ul className={depth === 0 ? "" : "ml-4 border-l border-zinc-200 dark:border-zinc-800 pl-3"}>
      {folders.map((f) => (
        <li key={f.id} className="py-0.5">
          <span className="text-zinc-700 dark:text-zinc-300">{f.name}/</span>
          <Tree node={f} depth={depth + 1} />
        </li>
      ))}
      {files.length > 0 && (
        <li className="py-0.5 text-zinc-400 dark:text-zinc-500">
          {files.length} file{files.length === 1 ? "" : "s"}
        </li>
      )}
    </ul>
  );
}

export default function ImportPlanner() {
  const [sourceKind, setSourceKind] = useState<SourceKind>("drive-folder");
  const [sourceInput, setSourceInput] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [levels, setLevels] = useState<LevelMap>([]);
  const [truncated, setTruncated] = useState<LevelKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [targets, setTargets] = useState<Targets | null>(null);
  const [schoolYearId, setSchoolYearId] = useState<string>("");
  const [grade, setGrade] = useState(7);
  const [track, setTrack] = useState("");
  const [defaultQuarter, setDefaultQuarter] = useState("");

  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const maxDepth = scan ? Math.min(folderDepth(scan.tree) + 1, DEPTH_LABEL.length) : 0;
  const levelErrors = levels.length ? validateLevelMap(levels) : [];

  // Recomputed on every dropdown change, in the browser, from the tree we
  // already have. No server round trip, so the feedback is immediate.
  const placement = useMemo(() => {
    if (!scan || !levels.length || levelErrors.length) return null;
    try {
      return applyLevelMap(scan.tree, levels);
    } catch {
      return null;
    }
  }, [scan, levels, levelErrors.length]);

  const needsDefaultQuarter = Boolean(
    placement && placement.materials.some((m) => !m.quarter)
  );

  async function runScan() {
    const id = extractDriveId(sourceInput);
    if (!id) {
      setError("Paste a Google Drive link or id first.");
      return;
    }
    setScanning(true);
    setError(null);
    setResult(null);
    try {
      const param = sourceKind === "drive-folder" ? "folderId" : "fileId";
      const [scanRes, targetRes] = await Promise.all([
        fetch(`/api/import/scan?${param}=${encodeURIComponent(id)}`),
        targets ? Promise.resolve(null) : fetch("/api/import/targets"),
      ]);

      if (!scanRes.ok) {
        setError((await scanRes.json()).error ?? "Could not read that folder.");
        return;
      }
      const data: ScanResponse = await scanRes.json();
      setScan(data);
      setLevels(data.proposal.levels);

      if (targetRes) {
        if (targetRes.ok) {
          const t: Targets = await targetRes.json();
          setTargets(t);
          setSchoolYearId(t.currentSchoolYearId ?? t.schoolYears[0]?.id ?? "");
        }
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setScanning(false);
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
            defaultQuarter: defaultQuarter || null,
          },
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

  /**
   * Change one level, then drop any deeper levels the change made impossible.
   *
   * Saying "the folder I picked is a unit" has to imply that the folders below
   * it are no longer quarters — nothing nests under a unit. Leaving the old
   * deeper levels in place would hand her an invalid map and an error message
   * for a choice that was perfectly reasonable. Truncating says what happened
   * instead of blaming her for it.
   */
  function setLevel(depth: number, kind: LevelKind) {
    const next = [...levels];
    while (next.length <= depth) next.push("container");
    next[depth] = kind;

    const kept: LevelMap = [];
    for (const k of next) {
      if (validateLevelMap([...kept, k]).length) break;
      kept.push(k);
    }
    setTruncated(kept.length < next.length ? kind : null);
    setLevels(kept);
  }

  const card =
    "rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 mb-4";
  const label = "block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1";
  const input =
    "w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100";
  const stepHeading = "text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3";

  return (
    <div>
      {/* ── 1. What are you pointing at ─── */}
      <div className={card}>
        <h2 className={stepHeading}>1 · What are you importing?</h2>

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
            className={input}
            value={sourceInput}
            placeholder="https://drive.google.com/drive/folders/…"
            onChange={(e) => setSourceInput(e.target.value)}
          />
          <button
            type="button"
            onClick={runScan}
            disabled={scanning || !sourceInput.trim()}
            className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 disabled:opacity-40"
          >
            {scanning ? "Looking…" : "Look at it"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-3 mb-4 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* ── 2. What does it mean ─── */}
      {scan && (
        <div className={card}>
          <h2 className={stepHeading}>2 · What is this?</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
            {scan.folderCount} folder{scan.folderCount === 1 ? "" : "s"}, {scan.fileCount} file
            {scan.fileCount === 1 ? "" : "s"}. {scan.proposal.reason}
          </p>

          <div className="rounded-md bg-zinc-50 dark:bg-zinc-950 p-3 mb-4 text-xs font-mono overflow-x-auto">
            <div className="text-zinc-700 dark:text-zinc-300">{scan.tree.name}/</div>
            <Tree node={scan.tree} />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {Array.from({ length: maxDepth }).map((_, depth) => (
              <div key={depth}>
                <label className={label} htmlFor={`level-${depth}`}>
                  {DEPTH_LABEL[depth]}
                </label>
                <select
                  id={`level-${depth}`}
                  className={input}
                  value={levels[depth] ?? "container"}
                  onChange={(e) => setLevel(depth, e.target.value as LevelKind)}
                >
                  {LEVEL_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {scan.proposal.alternatives.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {scan.proposal.alternatives.map((alt, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setLevels(alt.levels)}
                  className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left"
                >
                  Or: {alt.reason}
                </button>
              ))}
            </div>
          )}

          {truncated && (
            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
              Nothing nests below {KIND_LABEL[truncated].toLowerCase()}, so the deeper levels were
              cleared. Files further down still come in — they just belong to whatever is above
              them.
            </p>
          )}

          {levelErrors.length > 0 && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">
              {levelErrors.map((e) => e.message).join(" ")}
            </p>
          )}

          {placement && (
            <div className="mt-4 rounded-md border border-zinc-200 dark:border-zinc-800 p-3">
              <p className="text-sm text-zinc-900 dark:text-zinc-100">
                That reads as <strong>{placement.units.length}</strong> unit
                {placement.units.length === 1 ? "" : "s"}
                {placement.quarters.length > 0 && (
                  <>
                    {" "}
                    across <strong>{placement.quarters.join(", ")}</strong>
                  </>
                )}
                , with <strong>{placement.materials.length}</strong> file
                {placement.materials.length === 1 ? "" : "s"}.
              </p>
              {placement.units.length > 0 && (
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {placement.units.join(" · ")}
                </p>
              )}
              {placement.warnings.map((w, i) => (
                <p key={i} className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                  {w}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 3. Where does it go ─── */}
      {scan && targets && (
        <div className={card}>
          <h2 className={stepHeading}>3 · Where does it go?</h2>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={label} htmlFor="school-year">
                School year
              </label>
              <select
                id="school-year"
                className={input}
                value={schoolYearId}
                onChange={(e) => setSchoolYearId(e.target.value)}
              >
                {targets.schoolYears.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                    {y.isCurrent ? " (current)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={label} htmlFor="grade">
                Grade
              </label>
              <select
                id="grade"
                className={input}
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
                className={input}
                value={track}
                placeholder="honors"
                onChange={(e) => setTrack(e.target.value)}
              />
            </div>
          </div>

          {needsDefaultQuarter && (
            <div className="mt-3 sm:w-1/3">
              <label className={label} htmlFor="default-quarter">
                Quarter for files your folders did not place
              </label>
              <select
                id="default-quarter"
                className={input}
                value={defaultQuarter}
                onChange={(e) => setDefaultQuarter(e.target.value)}
              >
                <option value="">Leave unassigned</option>
                {QUARTERS.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
            </div>
          )}

          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            {(() => {
              const match = targets.courses.find(
                (c) =>
                  c.grade === grade &&
                  (c.track ?? null) === (track.trim() || null) &&
                  (c.schoolYearId ?? null) === (schoolYearId || null)
              );
              return match
                ? "Adds to the course you already have for this grade and year."
                : "No course exists for this grade and year yet — importing creates one.";
            })()}
          </p>
        </div>
      )}

      {/* ── 4. Do it ─── */}
      {scan && placement && (
        <div className={card}>
          <button
            type="button"
            onClick={runImport}
            disabled={importing || levelErrors.length > 0 || placement.materials.length === 0}
            className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 disabled:opacity-40"
          >
            {importing
              ? "Importing…"
              : `Import ${placement.materials.length} file${placement.materials.length === 1 ? "" : "s"}`}
          </button>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Your files stay where they are in Drive — nothing is copied or moved.
          </p>
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-emerald-300 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 p-4 text-sm">
          <p className="text-emerald-800 dark:text-emerald-300">
            Imported {result.total} file{result.total === 1 ? "" : "s"} — {result.created} new,{" "}
            {result.updated} updated
            {result.courseCreated ? ", and a new course was created" : ""}.
          </p>
          {result.units.length > 0 && (
            <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
              Units: {result.units.join(" · ")}
            </p>
          )}
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
