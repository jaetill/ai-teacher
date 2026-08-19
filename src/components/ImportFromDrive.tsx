"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CATEGORIES,
  DESTINATIONS,
  MATERIAL_TYPES,
  GRADES,
} from "@/lib/upload-utils";
import { announceMaterialsImported } from "@/lib/materials-events";

// ── Types ───

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  grade: number;
  destination: string;
  category: string;
  materialType: string;
  // The teacher's own unit, captured from the Drive subfolder this file lived in.
  sourceUnit: string | null;
  // Scans are recursive, so pointing at a grade folder pulls the whole tree.
  // Selection lets a single file (e.g. the year plan sitting at the root) be
  // imported on its own without importing everything under it.
  selected: boolean;
  status: "pending" | "copying" | "done" | "error";
  driveWebUrl?: string;
};

type Step = "input" | "classify" | "import" | "build";

// ── Helpers ───

function extractFolderId(input: string): string | null {
  // Handle full URLs or raw IDs
  const match = input.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  // Maybe it's just an ID
  if (/^[a-zA-Z0-9_-]{10,}$/.test(input.trim())) return input.trim();
  return null;
}

// Friendly labels for buckets whose stored value is terse (value → label).
function destinationLabel(d: string): string {
  if (d === "YearPlan") return "Year Plan";
  if (d === "Summer") return "Summer Reading";
  return d;
}

// ── Component ───

export default function ImportFromDrive() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("input");
  const [folderInput, setFolderInput] = useState("");
  const [defaultGrade, setDefaultGrade] = useState(8);
  const [defaultQuarter, setDefaultQuarter] = useState("Q1");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [importing, setImporting] = useState(false);
  const [building, setBuilding] = useState(false);
  const [buildResult, setBuildResult] = useState<{ courseId: string; unitCount: number; lessonCount: number; units: Array<{ id: string; title: string }> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Step 1: Scan folder ───

  async function scanFolder() {
    const id = extractFolderId(folderInput);
    if (!id) {
      setError("Could not extract a folder ID from that link");
      return;
    }
    setFolderId(id);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/drive/import?folderId=${id}`);
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("Server error — try signing out and back in");
      }
      if (!res.ok) {
        throw new Error(data.error || "Failed to scan folder");
      }
      setFiles(
        data.files.map(
          (f: { id: string; name: string; mimeType: string; sourceUnit?: string | null }) => ({
            ...f,
            grade: defaultGrade,
            destination: defaultQuarter,
            category: "Activities",
            materialType: "other",
            sourceUnit: f.sourceUnit ?? null,
            selected: true,
            status: "pending",
          })
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to scan folder");
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: Classify ───

  async function classify() {
    // `files` always holds the FULL scan result; deselected rows are filtered
    // at render and send time, never removed from state. An earlier version
    // dropped them here, which quietly made "Back" from the classify step a
    // one-way door — the deselected files were gone and only a re-scan brought
    // them back (PR #680 review, CODE-M1).
    const chosen = files.filter((f) => f.selected);
    if (chosen.length === 0) {
      setError("Select at least one file to import");
      return;
    }
    // Declaring "Year Plan" at step 1 is a scope statement, not a guess: the
    // classifier's per-file quarter opinion would only fight it.
    const scopedToYearPlan = defaultQuarter === "YearPlan";

    setClassifying(true);
    setError(null);
    try {
      const res = await fetch("/api/upload/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filenames: chosen.map((f) => f.name),
          zipName: scopedToYearPlan
            ? `Grade ${defaultGrade} Year Plan`
            : `Grade ${defaultGrade} ${destinationLabel(defaultQuarter)}`,
        }),
      });
      if (!res.ok) throw new Error("Classification failed");

      const { classifications } = await res.json();
      setFiles((prev) =>
        prev.map((f) => {
          // Only the selected rows were sent for classification; the rest stay
          // exactly as scanned so Back still shows the whole folder.
          if (!f.selected) return f;
          const match = classifications.find(
            (c: { filename: string }) => c.filename === f.name
          );
          if (match) {
            return {
              ...f,
              grade: match.grade ?? f.grade,
              destination: scopedToYearPlan
                ? "YearPlan"
                : match.destination ?? f.destination,
              category: match.category ?? f.category,
              materialType: match.materialType ?? f.materialType,
            };
          }
          return f;
        })
      );
      setStep("classify");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Classification failed");
    } finally {
      setClassifying(false);
    }
  }

  // ── Step 3.5: Build curriculum ───

  async function buildCurriculum() {
    // Determine grade and quarter from the majority of imported files
    const gradeCounts = new Map<number, number>();
    const destCounts = new Map<string, number>();
    for (const f of files) {
      if (f.status === "done") {
        gradeCounts.set(f.grade, (gradeCounts.get(f.grade) ?? 0) + 1);
        if (f.destination !== "YearPlan") {
          destCounts.set(f.destination, (destCounts.get(f.destination) ?? 0) + 1);
        }
      }
    }
    const topGrade = [...gradeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 8;
    const topDest = [...destCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Q1";

    setBuilding(true);
    setError(null);
    try {
      const res = await fetch("/api/import/build-curriculum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grade: topGrade, quarter: topDest }),
      });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("Server error building curriculum");
      }
      if (!res.ok) {
        throw new Error(data.error || "Failed to build curriculum");
      }
      setBuildResult({
        courseId: data.courseId,
        unitCount: data.unitCount,
        lessonCount: data.lessonCount,
        units: data.units ?? [],
      });
      setStep("build");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to build curriculum");
    } finally {
      setBuilding(false);
    }
  }

  // ── Step 3: Import ───

  async function importFiles() {
    if (!folderId) return;
    setStep("import");
    setImporting(true);

    // Only selected rows are imported; the rest stay "pending" in state so the
    // scan list is still whole if the user goes back.
    const toImport = files.filter((f) => f.selected);
    setFiles((prev) =>
      prev.map((f) => (f.selected ? { ...f, status: "copying" } : f))
    );

    // Batch import via the API
    try {
      const res = await fetch("/api/drive/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceFolderId: folderId,
          files: toImport.map((f) => ({
            sourceFileId: f.id,
            name: f.name,
            category: f.category,
            materialType: f.materialType,
            grade: f.grade,
            destination: f.destination,
            sourceUnit: f.sourceUnit,
          })),
        }),
      });

      if (!res.ok) throw new Error("Import failed");

      const data = await res.json();
      setFiles((prev) =>
        prev.map((f) => {
          if (!f.selected) return f;
          const result = data.results?.find(
            (r: { name: string }) => r.name === f.name
          );
          if (result) {
            return {
              ...f,
              status: result.status === "copied" ? "done" : "error",
              driveWebUrl: result.driveWebUrl,
            };
          }
          return { ...f, status: "error" };
        })
      );
      // #650: let SummarizeMaterials auto-index the fresh files.
      if (
        data.results?.some((r: { status: string }) => r.status === "copied")
      ) {
        announceMaterialsImported();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  // ── Field update helper ───

  // Keyed by file id, not array index: the classify and import tables render a
  // filtered view of `files`, so a row's position there no longer matches its
  // position in state.
  function updateFile(id: string, field: keyof DriveFile, value: unknown) {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, [field]: value } : f))
    );
  }

  function setAllSelected(selected: boolean) {
    setFiles((prev) => prev.map((f) => ({ ...f, selected })));
  }

  // ── Render ───

  // `files` is the whole scan; everything downstream of step 1 works on the
  // selected view of it.
  const selectedFiles = files.filter((f) => f.selected);
  const selectedCount = selectedFiles.length;
  const doneCount = files.filter((f) => f.status === "done").length;
  const errorCount = files.filter((f) => f.status === "error").length;
  // Year Plan material isn't built into units — it's reference for every build
  // of the grade. An import of nothing but year-plan files has no quarter to build.
  const builtableCount = files.filter(
    (f) => f.status === "done" && f.destination !== "YearPlan",
  ).length;
  const yearPlanDoneCount = files.filter(
    (f) => f.status === "done" && f.destination === "YearPlan",
  ).length;

  return (
    <div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* ── Step 1: Folder input ─── */}
        {step === "input" && (
          <div>
            <div className="flex gap-3 mb-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Grade
                </label>
                <select
                  value={defaultGrade}
                  onChange={(e) => setDefaultGrade(parseInt(e.target.value))}
                  className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2.5 text-sm text-zinc-900 dark:text-zinc-100"
                >
                  {GRADES.map((g) => (
                    <option key={g} value={g}>
                      Grade {g}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Goes in
                </label>
                <select
                  value={defaultQuarter}
                  onChange={(e) => setDefaultQuarter(e.target.value)}
                  className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2.5 text-sm text-zinc-900 dark:text-zinc-100"
                >
                  {DESTINATIONS.map((d) => (
                    <option key={d} value={d}>
                      {destinationLabel(d)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {defaultQuarter === "YearPlan" && (
              <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Year Plan material belongs to the whole grade, not one quarter — a
                pacing guide, a standards map, your plan for the year. It isn&apos;t
                built into units; it&apos;s read as reference every time you build any
                quarter of Grade {defaultGrade}.
              </p>
            )}
            <div className="flex gap-3">
              <input
                type="text"
                value={folderInput}
                onChange={(e) => setFolderInput(e.target.value)}
                placeholder="Paste Google Drive folder link or ID..."
                className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
              />
              <button
                onClick={scanFolder}
                disabled={!folderInput.trim() || loading}
                className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-5 py-2.5 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-40 transition-colors"
              >
                {loading ? "Scanning..." : "Scan Folder"}
              </button>
            </div>

            {files.length > 0 && (
              <div className="mt-6">
                <div className="flex items-baseline justify-between mb-3 gap-3">
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">
                    Found {files.length} files
                    {(() => {
                      const units = [...new Set(files.map((f) => f.sourceUnit).filter(Boolean))];
                      return units.length > 0 ? (
                        <span className="text-zinc-400">
                          {" "}
                          · recognized {units.length} unit{units.length === 1 ? "" : "s"} from your
                          folders
                        </span>
                      ) : null;
                    })()}
                    <span className="text-zinc-400"> · {selectedCount} selected</span>
                  </p>
                  <div className="flex shrink-0 gap-2 text-xs">
                    <button
                      onClick={() => setAllSelected(true)}
                      className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
                    >
                      Select all
                    </button>
                    <span className="text-zinc-300 dark:text-zinc-700">·</span>
                    <button
                      onClick={() => setAllSelected(false)}
                      className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
                    >
                      Select none
                    </button>
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
                  {files.map((f) => (
                    <label
                      key={f.id}
                      className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 py-0.5 cursor-pointer hover:text-zinc-800 dark:hover:text-zinc-200"
                    >
                      <input
                        type="checkbox"
                        checked={f.selected}
                        onChange={(e) => updateFile(f.id, "selected", e.target.checked)}
                        className="shrink-0 accent-zinc-900 dark:accent-zinc-100"
                      />
                      <span className="truncate">{f.name}</span>
                      {f.sourceUnit ? (
                        <span className="shrink-0 rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                          {f.sourceUnit}
                        </span>
                      ) : (
                        <span className="shrink-0 text-[10px] text-zinc-400 dark:text-zinc-600">
                          at root
                        </span>
                      )}
                    </label>
                  ))}
                </div>
                <button
                  onClick={classify}
                  disabled={classifying || selectedCount === 0}
                  className="mt-4 rounded-lg bg-zinc-900 dark:bg-zinc-100 px-5 py-2.5 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-40 transition-colors"
                >
                  {classifying
                    ? `Classifying ${selectedCount} files...`
                    : `Classify ${selectedCount} File${selectedCount === 1 ? "" : "s"}`}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Review classification ─── */}
        {step === "classify" && (
          <div>
            <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-zinc-100 dark:bg-zinc-800/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-zinc-600 dark:text-zinc-300">
                      File
                    </th>
                    <th className="text-left px-3 py-2 font-medium text-zinc-600 dark:text-zinc-300 w-32">
                      Unit
                    </th>
                    <th className="text-left px-3 py-2 font-medium text-zinc-600 dark:text-zinc-300 w-20">
                      Grade
                    </th>
                    <th className="text-left px-3 py-2 font-medium text-zinc-600 dark:text-zinc-300 w-28">
                      Destination
                    </th>
                    <th className="text-left px-3 py-2 font-medium text-zinc-600 dark:text-zinc-300 w-32">
                      Category
                    </th>
                    <th className="text-left px-3 py-2 font-medium text-zinc-600 dark:text-zinc-300 w-32">
                      Type
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-zinc-900">
                  {selectedFiles.map((f) => (
                    <tr
                      key={f.id}
                      className="border-t border-zinc-100 dark:border-zinc-800"
                    >
                      <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300 truncate max-w-xs">
                        {f.name}
                      </td>
                      <td className="px-3 py-2">
                        {f.sourceUnit ? (
                          <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-600 dark:text-zinc-300">
                            {f.sourceUnit}
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={f.grade}
                          onChange={(e) =>
                            updateFile(f.id, "grade", parseInt(e.target.value))
                          }
                          className="w-full rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300"
                        >
                          {GRADES.map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={f.destination}
                          onChange={(e) =>
                            updateFile(f.id, "destination", e.target.value)
                          }
                          className="w-full rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300"
                        >
                          {DESTINATIONS.map((d) => (
                            <option key={d} value={d}>
                              {destinationLabel(d)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        {f.destination === "YearPlan" ? (
                          <span className="text-xs text-zinc-400">—</span>
                        ) : (
                          <select
                            value={f.category}
                            onChange={(e) =>
                              updateFile(f.id, "category", e.target.value)
                            }
                            className="w-full rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300"
                          >
                            {CATEGORIES.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={f.materialType}
                          onChange={(e) =>
                            updateFile(f.id, "materialType", e.target.value)
                          }
                          className="w-full rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300"
                        >
                          {MATERIAL_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t.replace("_", " ")}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setStep("input")}
                className="rounded-lg border border-zinc-200 dark:border-zinc-700 px-4 py-2.5 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Back
              </button>
              <button
                onClick={importFiles}
                className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-5 py-2.5 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
              >
                Import {selectedCount} File{selectedCount === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Import progress ─── */}
        {step === "import" && (
          <div>
            {importing ? (
              <div className="mb-6">
                <p className="text-sm text-zinc-600 dark:text-zinc-300 mb-2">
                  Importing {selectedCount} files...
                </p>
                <div className="h-2 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full bg-zinc-900 dark:bg-zinc-100 transition-all duration-300 animate-pulse"
                    style={{ width: "100%" }}
                  />
                </div>
              </div>
            ) : (
              <div className="mb-6 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
                Done! {doneCount} imported
                {errorCount > 0 && `, ${errorCount} failed`}
              </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-zinc-100 dark:bg-zinc-800/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-zinc-600 dark:text-zinc-300">
                      File
                    </th>
                    <th className="text-left px-3 py-2 font-medium text-zinc-600 dark:text-zinc-300 w-36">
                      Destination
                    </th>
                    <th className="text-left px-3 py-2 font-medium text-zinc-600 dark:text-zinc-300 w-28">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-zinc-900">
                  {selectedFiles.map((f) => (
                    <tr
                      key={f.id}
                      className="border-t border-zinc-100 dark:border-zinc-800"
                    >
                      <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300 truncate max-w-xs">
                        {f.driveWebUrl ? (
                          <a
                            href={f.driveWebUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:text-zinc-900 dark:hover:text-zinc-100"
                          >
                            {f.name}
                          </a>
                        ) : (
                          f.name
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                        G{f.grade}{" "}
                        {f.destination === "YearPlan"
                          ? "Year Plan"
                          : `${f.destination} / ${f.category}`}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {f.status === "done" ? (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            Imported
                          </span>
                        ) : f.status === "copying" ? (
                          <span className="text-zinc-500 animate-pulse">
                            Copying...
                          </span>
                        ) : f.status === "error" ? (
                          <span className="text-red-600 dark:text-red-400">
                            Failed
                          </span>
                        ) : (
                          <span className="text-zinc-400">Pending</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!importing && yearPlanDoneCount > 0 && (
              <div className="mt-4 rounded-lg border border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/30 px-4 py-3 text-sm text-indigo-800 dark:text-indigo-300">
                {yearPlanDoneCount} year-plan{" "}
                {yearPlanDoneCount === 1 ? "file" : "files"} saved. There&apos;s nothing
                to build from these — they&apos;ll be read as reference every time you
                build a quarter of this grade.
              </div>
            )}

            {!importing && builtableCount > 0 && (
              <div className="mt-4 flex gap-3">
                <button
                  onClick={buildCurriculum}
                  disabled={building}
                  className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-5 py-2.5 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-40 transition-colors"
                >
                  {building
                    ? "Building curriculum..."
                    : "Build Curriculum from These Files"}
                </button>
                <Link
                  href="/"
                  className="rounded-lg border border-zinc-200 dark:border-zinc-700 px-4 py-2.5 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors inline-block"
                >
                  Skip
                </Link>
              </div>
            )}

            {!importing && builtableCount === 0 && doneCount > 0 && (
              <div className="mt-4">
                <Link
                  href="/"
                  className="rounded-lg border border-zinc-200 dark:border-zinc-700 px-4 py-2.5 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors inline-block"
                >
                  Done
                </Link>
              </div>
            )}
          </div>
        )}

        {/* ── Step 4: Build result ─── */}
        {step === "build" && buildResult && (
          <div>
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300 mb-4">
              Created {buildResult.unitCount}{" "}
              {buildResult.unitCount === 1 ? "unit" : "units"} with {buildResult.lessonCount} lessons:
              {buildResult.units.length > 0 && (
                <ul className="mt-1.5 list-disc list-inside space-y-0.5">
                  {buildResult.units.map((u) => (
                    <li key={u.id}>{u.title}</li>
                  ))}
                </ul>
              )}
            </div>
            <button
              onClick={() =>
                router.push(`/curriculum/edit/${buildResult.courseId}`)
              }
              className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-5 py-2.5 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
            >
              View Curriculum
            </button>
          </div>
        )}
    </div>
  );
}
