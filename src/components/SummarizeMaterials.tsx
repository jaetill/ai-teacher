"use client";

// "Summarize materials" — teacher-triggered batch pass that gives every
// imported file an AI-readable description (see /api/materials/summarize).
// Deliberately a button, not an automatic job: the teacher controls when
// API spend happens. Future: run automatically as part of import (#633
// discussion) if the added latency is acceptable.

import { useState, useEffect, useRef } from "react";

type Status = "idle" | "running" | "done" | "error";

export default function SummarizeMaterials() {
  const [unsummarized, setUnsummarized] = useState<number | null>(null);
  const [unsupported, setUnsupported] = useState(0);
  const [status, setStatus] = useState<Status>("idle");
  const [processedTotal, setProcessedTotal] = useState(0);
  const [failedTitles, setFailedTitles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);

  async function refreshCount() {
    try {
      const res = await fetch("/api/materials/summarize");
      if (!res.ok) return;
      const data = await res.json();
      setUnsummarized(data.extractable ?? 0);
      setUnsupported(data.unsupported ?? 0);
    } catch {
      // Non-fatal: the card just won't show a count.
    }
  }

  useEffect(() => {
    refreshCount();
  }, []);

  async function run() {
    setStatus("running");
    setError(null);
    setProcessedTotal(0);
    setFailedTitles([]);
    cancelRef.current = false;
    try {
      // Loop batches until nothing remains or a batch makes no progress
      // (persistent failures must not spin forever).
      for (;;) {
        if (cancelRef.current) break;
        const res = await fetch("/api/materials/summarize", { method: "POST" });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `Request failed (${res.status})`);
        }
        const data = await res.json();
        setProcessedTotal((n) => n + (data.processed ?? 0));
        if (data.failed?.length) {
          setFailedTitles((prev) => [...prev, ...data.failed]);
        }
        if ((data.remaining ?? 0) === 0 || (data.processed ?? 0) === 0) break;
      }
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Summarization failed");
      setStatus("error");
    } finally {
      await refreshCount();
    }
  }

  if (unsummarized === null || (unsummarized === 0 && status === "idle")) {
    return null; // nothing to do — keep the page quiet
  }

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 mb-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            AI summaries for imported files
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            {status === "running"
              ? `Summarizing… ${processedTotal} done`
              : status === "done"
                ? `Done — ${processedTotal} file${processedTotal === 1 ? "" : "s"} summarized${failedTitles.length ? `, ${failedTitles.length} failed` : ""}.`
                : `${unsummarized} file${unsummarized === 1 ? "" : "s"} without a summary. Summaries make the copilot able to reference what's inside your documents. Uses your API key (small model — the whole batch costs well under a dollar).`}
            {unsupported > 0 && status === "idle" && (
              <span className="text-zinc-400"> {unsupported} PDF/slide files can&apos;t be read yet and will be skipped.</span>
            )}
          </p>
          {error && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>}
          {status === "done" && failedTitles.length > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              Couldn&apos;t read: {failedTitles.slice(0, 5).join("; ")}
              {failedTitles.length > 5 ? ` …and ${failedTitles.length - 5} more` : ""}
            </p>
          )}
        </div>
        {status === "running" ? (
          <button
            onClick={() => {
              cancelRef.current = true;
            }}
            className="text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-1.5"
          >
            Stop after this batch
          </button>
        ) : (
          unsummarized > 0 && (
            <button
              onClick={run}
              className="text-xs font-medium text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 rounded-lg px-3 py-1.5 hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors shrink-0"
            >
              Summarize {unsummarized} file{unsummarized === 1 ? "" : "s"}
            </button>
          )
        )}
      </div>
    </div>
  );
}
