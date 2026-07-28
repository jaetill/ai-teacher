"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

type FileRow = { title: string; materialType: string; category: string };
type QuarterSummary = {
  quarter: string;
  total: number;
  categories: Record<string, number>;
  files: FileRow[];
};
type GradeSummary = { grade: number; total: number; quarters: QuarterSummary[] };

const ALL_QUARTERS = ["Q1", "Q2", "Q3", "Q4"];

const QUARTER_STYLES: Record<string, string> = {
  Q1: "border-l-blue-400 dark:border-l-blue-500",
  Q2: "border-l-violet-400 dark:border-l-violet-500",
  Q3: "border-l-teal-400 dark:border-l-teal-500",
  Q4: "border-l-amber-400 dark:border-l-amber-500",
};

// Shows what the signed-in teacher has already imported, grouped by quarter,
// so they can see progress and what's still missing before building.
export default function ImportedSummary({ refreshKey = 0 }: { refreshKey?: number }) {
  const router = useRouter();
  const [grades, setGrades] = useState<GradeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeGrade, setActiveGrade] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  // Build-from-this-quarter state (turns imported files into units).
  const [confirmingBuild, setConfirmingBuild] = useState<string | null>(null);
  const [buildingQuarter, setBuildingQuarter] = useState<string | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);

  async function buildQuarter(grade: number, quarter: string) {
    setBuildingQuarter(quarter);
    setBuildError(null);
    try {
      const res = await fetch("/api/import/build-curriculum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grade, quarter }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBuildError(data.error ?? `Build failed (error ${res.status}).`);
        setBuildingQuarter(null);
        return;
      }
      // Land in the editor with the newly built units.
      router.push(`/curriculum/edit/${data.courseId}`);
    } catch (err) {
      console.error("Build failed", err);
      setBuildError("Something went wrong during the build. Please try again.");
      setBuildingQuarter(null);
    }
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/materials/summary");
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      const g: GradeSummary[] = data.grades ?? [];
      setGrades(g);
      setActiveGrade((prev) => prev ?? g[0]?.grade ?? null);
    } catch (err) {
      console.error("Failed to load import summary", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 mb-8">
        <span className="text-sm text-zinc-400 animate-pulse">Loading import progress…</span>
      </div>
    );
  }

  if (grades.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 mb-8">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Nothing imported yet. Files you import below will show up here, grouped by quarter.
        </p>
      </div>
    );
  }

  const grade = grades.find((g) => g.grade === activeGrade) ?? grades[0];
  const byQuarter = new Map(grade.quarters.map((q) => [q.quarter, q]));

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 mb-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Imported so far</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            What&apos;s been imported and for which quarter. Empty quarters still need files.
          </p>
        </div>
        {grades.length > 1 && (
          <div className="flex gap-1">
            {grades.map((g) => (
              <button
                key={g.grade}
                onClick={() => {
                  setActiveGrade(g.grade);
                  setExpanded(null);
                }}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  g.grade === grade.grade
                    ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                    : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                Grade {g.grade}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {ALL_QUARTERS.map((qk) => {
          const q = byQuarter.get(qk);
          const total = q?.total ?? 0;
          const isEmpty = total === 0;
          const isOpen = expanded === qk;
          return (
            <div
              key={qk}
              className={`rounded-lg border border-l-4 ${QUARTER_STYLES[qk]} ${
                isEmpty
                  ? "border-dashed border-zinc-200 dark:border-zinc-800 bg-transparent"
                  : "border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40"
              } p-3`}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {qk}
                </span>
                <span
                  className={`text-sm font-semibold ${
                    isEmpty ? "text-zinc-400 dark:text-zinc-600" : "text-zinc-900 dark:text-zinc-50"
                  }`}
                >
                  {total}
                </span>
              </div>
              {isEmpty ? (
                <p className="text-[11px] text-zinc-400 dark:text-zinc-600 mt-1">none yet</p>
              ) : (
                <>
                  <div className="mt-1.5 space-y-0.5">
                    {Object.entries(q!.categories)
                      .sort((a, b) => a[0].localeCompare(b[0]))
                      .map(([cat, n]) => (
                        <div
                          key={cat}
                          className="flex justify-between text-[11px] text-zinc-500 dark:text-zinc-400"
                        >
                          <span>{cat}</span>
                          <span>{n}</span>
                        </div>
                      ))}
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <button
                      onClick={() => setExpanded(isOpen ? null : qk)}
                      className="text-[11px] font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
                    >
                      {isOpen ? "Hide files" : "See files"}
                    </button>
                    {buildingQuarter === qk ? (
                      <span className="text-[11px] font-medium text-zinc-400 animate-pulse">
                        Building…
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmingBuild(qk)}
                        disabled={buildingQuarter !== null}
                        className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 disabled:opacity-40 transition-colors"
                      >
                        Build →
                      </button>
                    )}
                  </div>
                  {confirmingBuild === qk && buildingQuarter === null && (
                    <div className="mt-2 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2 space-y-1.5">
                      <p className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-snug">
                        Build {qk}&apos;s {total} files into units? Do this{" "}
                        <strong>once per quarter</strong> — running it again creates
                        duplicate units.
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setConfirmingBuild(null);
                            buildQuarter(grade.grade, qk);
                          }}
                          className="text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded px-2 py-0.5 transition-colors"
                        >
                          Build {qk}
                        </button>
                        <button
                          onClick={() => setConfirmingBuild(null)}
                          className="text-[11px] font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {buildError && (
        <div className="mt-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-2.5 text-xs text-red-700 dark:text-red-300">
          {buildError}
        </div>
      )}

      {expanded && byQuarter.get(expanded) && (
        <div className="mt-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 p-3 max-h-56 overflow-y-auto">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 mb-2">
            {expanded} files ({byQuarter.get(expanded)!.total})
          </p>
          <div className="space-y-1">
            {byQuarter.get(expanded)!.files.map((f, i) => (
              <div key={i} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-zinc-700 dark:text-zinc-300 truncate">{f.title}</span>
                <span className="text-[10px] text-zinc-400 shrink-0">
                  {f.category} · {f.materialType}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
