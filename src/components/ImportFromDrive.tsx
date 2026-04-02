"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CATEGORIES,
  DESTINATIONS,
  MATERIAL_TYPES,
  GRADES,
} from "@/lib/upload-utils";

// ── Types ───

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  grade: number;
  destination: string;
  category: string;
  materialType: string;
  status: "pending" | "copying" | "done" | "error";
  driveWebUrl?: string;
};

type Step = "input" | "classify" | "import";

// ── Helpers ───

function extractFolderId(input: string): string | null {
  // Handle full URLs or raw IDs
  const match = input.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  // Maybe it's just an ID
  if (/^[a-zA-Z0-9_-]{10,}$/.test(input.trim())) return input.trim();
  return null;
}

// ── Component ───

export default function ImportFromDrive() {
  const [step, setStep] = useState<Step>("input");
  const [folderInput, setFolderInput] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
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
        data.files.map((f: { id: string; name: string; mimeType: string }) => ({
          ...f,
          grade: 8,
          destination: "Q1",
          category: "Activities",
          materialType: "other",
          status: "pending",
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to scan folder");
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: Classify ───

  async function classify() {
    setClassifying(true);
    setError(null);
    try {
      const res = await fetch("/api/upload/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filenames: files.map((f) => f.name),
        }),
      });
      if (!res.ok) throw new Error("Classification failed");

      const { classifications } = await res.json();
      setFiles((prev) =>
        prev.map((f) => {
          const match = classifications.find(
            (c: { filename: string }) => c.filename === f.name
          );
          if (match) {
            return {
              ...f,
              grade: match.grade ?? f.grade,
              destination: match.destination ?? f.destination,
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

  // ── Step 3: Import ───

  async function importFiles() {
    if (!folderId) return;
    setStep("import");
    setImporting(true);
    setProgress(0);

    const toImport = files;
    for (let i = 0; i < toImport.length; i++) {
      setProgress(i + 1);
      setFiles((prev) =>
        prev.map((f, idx) =>
          idx === i ? { ...f, status: "copying" } : f
        )
      );
    }

    // Batch import via the API
    try {
      const res = await fetch("/api/drive/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceFolderId: folderId,
          files: files.map((f) => ({
            sourceFileId: f.id,
            name: f.name,
            category: f.category,
            materialType: f.materialType,
            grade: f.grade,
            destination: f.destination,
          })),
        }),
      });

      if (!res.ok) throw new Error("Import failed");

      const data = await res.json();
      setFiles((prev) =>
        prev.map((f) => {
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
      setProgress(files.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  // ── Field update helper ───

  function updateFile(index: number, field: keyof DriveFile, value: unknown) {
    setFiles((prev) =>
      prev.map((f, i) => (i === index ? { ...f, [field]: value } : f))
    );
  }

  // ── Render ───

  const doneCount = files.filter((f) => f.status === "done").length;
  const errorCount = files.filter((f) => f.status === "error").length;

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
                <p className="text-sm text-zinc-600 dark:text-zinc-300 mb-3">
                  Found {files.length} files
                </p>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
                  {files.map((f) => (
                    <div
                      key={f.id}
                      className="text-xs text-zinc-500 dark:text-zinc-400 py-0.5 truncate"
                    >
                      {f.name}
                    </div>
                  ))}
                </div>
                <button
                  onClick={classify}
                  disabled={classifying}
                  className="mt-4 rounded-lg bg-zinc-900 dark:bg-zinc-100 px-5 py-2.5 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-40 transition-colors"
                >
                  {classifying
                    ? `Classifying ${files.length} files...`
                    : "Classify Files"}
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
                  {files.map((f, i) => (
                    <tr
                      key={f.id}
                      className="border-t border-zinc-100 dark:border-zinc-800"
                    >
                      <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300 truncate max-w-xs">
                        {f.name}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={f.grade}
                          onChange={(e) =>
                            updateFile(i, "grade", parseInt(e.target.value))
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
                            updateFile(i, "destination", e.target.value)
                          }
                          className="w-full rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300"
                        >
                          {DESTINATIONS.map((d) => (
                            <option key={d} value={d}>
                              {d === "YearPlan" ? "Year Plan" : d}
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
                              updateFile(i, "category", e.target.value)
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
                            updateFile(i, "materialType", e.target.value)
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
                Import {files.length} Files
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
                  Importing {files.length} files...
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
                  {files.map((f) => (
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

            {!importing && (
              <div className="mt-4">
                <Link
                  href="/"
                  className="rounded-lg border border-zinc-200 dark:border-zinc-700 px-4 py-2.5 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors inline-block"
                >
                  Back to Home
                </Link>
              </div>
            )}
          </div>
        )}
    </div>
  );
}
