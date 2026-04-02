"use client";

import { useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import JSZip from "jszip";
import {
  CATEGORIES,
  DESTINATIONS,
  MATERIAL_TYPES,
  GRADES,
} from "@/lib/upload-utils";

// ── Types ───

type FileEntry = {
  id: string;
  file: File;
  name: string;
  grade: number;
  destination: string;
  category: string;
  materialType: string;
  isDuplicate: boolean;
  duplicateReason?: string;
  forceUpload: boolean;
  status: "pending" | "uploading" | "done" | "error";
  driveWebUrl?: string;
  errorMessage?: string;
};

type Step = "select" | "classify" | "confirm" | "upload";

// ── Helpers ───

function isJunk(name: string) {
  const base = name.split("/").pop() ?? name;
  return (
    base.startsWith(".") ||
    base.startsWith("__MACOSX") ||
    name.includes("__MACOSX")
  );
}

function stripZipPath(path: string) {
  return path.split("/").pop() ?? path;
}

// ── Component ───

export default function UploadPage() {
  const { data: session } = useSession();
  const [step, setStep] = useState<Step>("select");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [zipName, setZipName] = useState<string | undefined>();
  const [classifying, setClassifying] = useState(false);
  const [checking, setChecking] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadTotal, setUploadTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Step 1: File selection ───

  const processFiles = useCallback(async (fileList: FileList | File[]) => {
    const entries: FileEntry[] = [];
    const rawFiles = Array.from(fileList);

    for (const file of rawFiles) {
      if (file.name.toLowerCase().endsWith(".zip")) {
        setZipName(file.name.replace(/\.zip$/i, ""));
        const zip = await JSZip.loadAsync(file);
        const promises: Promise<void>[] = [];

        zip.forEach((relativePath, zipEntry) => {
          if (zipEntry.dir || isJunk(relativePath)) return;
          promises.push(
            zipEntry.async("blob").then((blob) => {
              const name = stripZipPath(relativePath);
              entries.push({
                id: crypto.randomUUID(),
                file: new File([blob], name, { type: blob.type }),
                name,
                grade: 8,
                destination: "Q1",
                category: "Activities",
                materialType: "other",
                isDuplicate: false,
                forceUpload: false,
                status: "pending",
              });
            })
          );
        });

        await Promise.all(promises);
      } else if (!isJunk(file.name)) {
        entries.push({
          id: crypto.randomUUID(),
          file,
          name: file.name,
          grade: 8,
          destination: "Q1",
          category: "Activities",
          materialType: "other",
          isDuplicate: false,
          forceUpload: false,
          status: "pending",
        });
      }
    }

    setFiles(entries);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      processFiles(e.dataTransfer.files);
    },
    [processFiles]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) processFiles(e.target.files);
    },
    [processFiles]
  );

  // ── Step 2: Classification ───

  const classify = async () => {
    setClassifying(true);
    setError(null);
    try {
      const res = await fetch("/api/upload/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filenames: files.map((f) => f.name),
          zipName,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Classification failed");
      }

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
  };

  // ── Step 3: Duplicate check ───

  const checkDuplicates = async () => {
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/upload/check-duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: files.map((f) => ({
            name: f.name,
            grade: f.grade,
            destination: f.destination,
            category: f.category,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Duplicate check failed");
      }

      const { results } = await res.json();

      setFiles((prev) =>
        prev.map((f, i) => ({
          ...f,
          isDuplicate: results[i]?.isDuplicate ?? false,
          duplicateReason: results[i]?.reason,
        }))
      );

      setStep("confirm");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Duplicate check failed"
      );
    } finally {
      setChecking(false);
    }
  };

  // ── Step 4: Upload ───

  const uploadFiles = async () => {
    setStep("upload");
    const toUpload = files.filter(
      (f) => !f.isDuplicate || f.forceUpload
    );
    setUploadTotal(toUpload.length);
    setUploadProgress(0);

    for (let i = 0; i < toUpload.length; i++) {
      const entry = toUpload[i];
      setUploadProgress(i + 1);
      setFiles((prev) =>
        prev.map((f) =>
          f.id === entry.id ? { ...f, status: "uploading" } : f
        )
      );

      try {
        const formData = new FormData();
        formData.append("file", entry.file);
        formData.append("name", entry.name);
        formData.append("category", entry.category);
        formData.append("materialType", entry.materialType);
        formData.append("grade", String(entry.grade));
        formData.append("destination", entry.destination);

        const res = await fetch("/api/upload/file", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Upload failed");
        }

        const { driveWebUrl } = await res.json();
        setFiles((prev) =>
          prev.map((f) =>
            f.id === entry.id
              ? { ...f, status: "done", driveWebUrl }
              : f
          )
        );
      } catch (err) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === entry.id
              ? {
                  ...f,
                  status: "error",
                  errorMessage:
                    err instanceof Error ? err.message : "Upload failed",
                }
              : f
          )
        );
      }
    }
  };

  // ── Field update helper ───

  const updateFile = (id: string, field: keyof FileEntry, value: unknown) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, [field]: value } : f))
    );
  };

  // ── Render ───

  if (!session) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 px-6 py-12">
        <div className="max-w-4xl mx-auto">
          <p className="text-zinc-500 dark:text-zinc-400">
            Please{" "}
            <Link href="/" className="underline">
              sign in
            </Link>{" "}
            to upload files.
          </p>
        </div>
      </div>
    );
  }

  const doneCount = files.filter((f) => f.status === "done").length;
  const errorCount = files.filter((f) => f.status === "error").length;
  const dupeCount = files.filter(
    (f) => f.isDuplicate && !f.forceUpload
  ).length;
  const uploadableCount = files.length - dupeCount;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 px-6 py-12">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
          Bulk Upload
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-8">
          Drop files or a zip — AI classifies them into the right Drive folders
        </p>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* ── Step 1: Select files ─── */}
        {step === "select" && (
          <div>
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-8 py-16 text-center cursor-pointer hover:border-zinc-400 dark:hover:border-zinc-500 transition-colors"
            >
              <p className="text-zinc-600 dark:text-zinc-300 text-lg mb-2">
                Drop files or a zip here
              </p>
              <p className="text-zinc-400 dark:text-zinc-500 text-sm">
                Accepts .docx, .pptx, .pdf, and .zip files
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".docx,.pptx,.pdf,.zip,.doc,.ppt,.xlsx"
                onChange={handleFileInput}
                className="hidden"
              />
            </div>

            {files.length > 0 && (
              <div className="mt-6">
                <p className="text-sm text-zinc-600 dark:text-zinc-300 mb-3">
                  {files.length} files ready
                  {zipName && (
                    <span className="text-zinc-400 dark:text-zinc-500">
                      {" "}
                      (from {zipName}.zip)
                    </span>
                  )}
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
                  {files.map((f) => (
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
                              {d === "YearPlan" ? "Year Plan" : d}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        {f.destination === "YearPlan" ? (
                          <span className="text-xs text-zinc-400 dark:text-zinc-500">
                            —
                          </span>
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
                onClick={() => setStep("select")}
                className="rounded-lg border border-zinc-200 dark:border-zinc-700 px-4 py-2.5 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Back
              </button>
              <button
                onClick={checkDuplicates}
                disabled={checking}
                className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-5 py-2.5 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-40 transition-colors"
              >
                {checking ? "Checking duplicates..." : "Check & Confirm"}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Confirm ─── */}
        {step === "confirm" && (
          <div>
            <div className="mb-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 text-sm">
              <span className="text-zinc-700 dark:text-zinc-300">
                {uploadableCount} files to upload
              </span>
              {dupeCount > 0 && (
                <span className="text-amber-600 dark:text-amber-400 ml-3">
                  {dupeCount} duplicates will be skipped
                </span>
              )}
            </div>

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
                    <th className="text-left px-3 py-2 font-medium text-zinc-600 dark:text-zinc-300 w-40">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-zinc-900">
                  {files.map((f) => (
                    <tr
                      key={f.id}
                      className={`border-t border-zinc-100 dark:border-zinc-800 ${
                        f.isDuplicate && !f.forceUpload
                          ? "opacity-50"
                          : ""
                      }`}
                    >
                      <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300 truncate max-w-xs">
                        {f.name}
                      </td>
                      <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                        G{f.grade}{" "}
                        {f.destination === "YearPlan"
                          ? "Year Plan"
                          : `${f.destination} / ${f.category}`}
                      </td>
                      <td className="px-3 py-2">
                        {f.isDuplicate ? (
                          <label className="flex items-center gap-2 text-xs">
                            <span className="text-amber-600 dark:text-amber-400">
                              {f.duplicateReason}
                            </span>
                            <input
                              type="checkbox"
                              checked={f.forceUpload}
                              onChange={(e) =>
                                updateFile(
                                  f.id,
                                  "forceUpload",
                                  e.target.checked
                                )
                              }
                              className="rounded"
                            />
                            <span className="text-zinc-500 dark:text-zinc-400">
                              upload anyway
                            </span>
                          </label>
                        ) : (
                          <span className="text-xs text-emerald-600 dark:text-emerald-400">
                            Ready
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setStep("classify")}
                className="rounded-lg border border-zinc-200 dark:border-zinc-700 px-4 py-2.5 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Back
              </button>
              <button
                onClick={uploadFiles}
                disabled={uploadableCount === 0}
                className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-5 py-2.5 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-40 transition-colors"
              >
                Upload {uploadableCount} Files
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Upload progress ─── */}
        {step === "upload" && (
          <div>
            {uploadProgress < uploadTotal ? (
              <div className="mb-6">
                <p className="text-sm text-zinc-600 dark:text-zinc-300 mb-2">
                  Uploading {uploadProgress} of {uploadTotal}...
                </p>
                <div className="h-2 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full bg-zinc-900 dark:bg-zinc-100 transition-all duration-300"
                    style={{
                      width: `${(uploadProgress / uploadTotal) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="mb-6 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
                Done! {doneCount} uploaded
                {errorCount > 0 && `, ${errorCount} failed`}
                {dupeCount > 0 && `, ${dupeCount} skipped (duplicates)`}
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
                        {f.isDuplicate && !f.forceUpload ? (
                          <span className="text-zinc-400">Skipped</span>
                        ) : f.status === "done" ? (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            Uploaded
                          </span>
                        ) : f.status === "uploading" ? (
                          <span className="text-zinc-500 animate-pulse">
                            Uploading...
                          </span>
                        ) : f.status === "error" ? (
                          <span
                            className="text-red-600 dark:text-red-400"
                            title={f.errorMessage}
                          >
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

            {uploadProgress >= uploadTotal && (
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
    </div>
  );
}
