"use client";

import { useState } from "react";

// One-time, non-destructive retrofit: point at the ORIGINAL source Drive folder
// you imported from, and we match by filename to fill in the unit each material
// belonged to. Nothing is re-copied, deleted, or overwritten.

function extractFolderId(input: string): string | null {
  const match = input.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(input.trim())) return input.trim();
  return null;
}

export default function RetrofitUnits() {
  const [open, setOpen] = useState(false);
  const [folderInput, setFolderInput] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ matched: number; skipped: number; units: number } | null>(
    null
  );

  async function run() {
    const id = extractFolderId(folderInput);
    if (!id) {
      setError("Could not read a folder ID from that link");
      return;
    }
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/import/backfill-units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceFolderId: id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Match failed (error ${res.status}).`);
        return;
      }
      setResult(data);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 mb-8">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Already imported? Match your existing units
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Point at the original Drive folder you imported from and we&apos;ll fill in each
            material&apos;s unit by filename. Nothing is re-copied or changed.
          </p>
        </div>
        <span className="text-xs text-zinc-400 shrink-0 ml-3">{open ? "Hide" : "Open"}</span>
      </button>

      {open && (
        <div className="mt-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={folderInput}
              onChange={(e) => setFolderInput(e.target.value)}
              placeholder="Paste the original Drive folder link or ID..."
              className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
            />
            <button
              onClick={run}
              disabled={!folderInput.trim() || running}
              className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-40 transition-colors"
            >
              {running ? "Matching…" : "Match units"}
            </button>
          </div>

          {error && (
            <div className="mt-2 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-2.5 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {result && (
            <div className="mt-2 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 p-2.5 text-xs text-emerald-700 dark:text-emerald-300">
              Matched {result.matched} material{result.matched === 1 ? "" : "s"} to {result.units}{" "}
              unit{result.units === 1 ? "" : "s"}
              {result.skipped > 0 &&
                `; ${result.skipped} left as-is (no confident filename match)`}
              .
            </div>
          )}
        </div>
      )}
    </div>
  );
}
