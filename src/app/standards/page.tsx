"use client";

// Standards coverage report + vertical alignment view. Read-only rollup of
// existing standards links — writes nothing, requires nothing new from
// imports. Two lenses on the same data: by-grade coverage (what's taught
// where, what's untouched) and a strand × grade alignment matrix.

import { useState, useEffect } from "react";
import Link from "next/link";
import { useCopilot } from "@/components/CopilotProvider";

type CoverageUnit = { unitId: string; unitTitle: string; quarter: string | null; grade: number | null };
type CoverageLesson = CoverageUnit & { lessonId: string; lessonTitle: string; coverageType: string | null };

type StandardCoverage = {
  id: string;
  grade: number;
  strandCode: string;
  strandName: string;
  description: string;
  parentId: string | null;
  units: CoverageUnit[];
  lessons: CoverageLesson[];
  covered: boolean;
};

export default function StandardsPage() {
  const { setPageContext } = useCopilot();
  const [rows, setRows] = useState<StandardCoverage[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"coverage" | "vertical">("coverage");
  const [grade, setGrade] = useState<number>(7);
  const [onlyGaps, setOnlyGaps] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/standards/coverage");
        const data = await res.json();
        setRows(data.standards ?? []);
      } catch (err) {
        console.error("Failed to load coverage", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const grades = [6, 7, 8];
  const gradeRows = rows.filter((s) => s.grade === grade);

  // Keep the copilot aware of exactly what the teacher is looking at: which
  // grade's coverage, which filter, and — most importantly — the specific
  // standard she has expanded, in the standard's own language. "This gap"
  // in her question should resolve to THIS standard.
  useEffect(() => {
    const expandedStd = rows.find((r) => r.id === expanded);
    const gaps = rows.filter((r) => r.grade === grade && !r.covered);
    let ctx = `Teacher is on the Standards ${view === "coverage" ? "coverage" : "vertical alignment"} page`;
    if (view === "coverage") {
      ctx += ` for Grade ${grade}${onlyGaps ? ", filtered to uncovered standards (gaps) only" : ""}.`;
      if (gaps.length > 0 && gaps.length <= 12) {
        ctx += ` Current Grade ${grade} gaps: ${gaps.map((g) => g.id).join(", ")}.`;
      }
    } else {
      ctx += ".";
    }
    if (expandedStd) {
      ctx += ` She has expanded standard ${expandedStd.id} ("${expandedStd.description.slice(0, 300)}") — ${
        expandedStd.covered ? "currently covered" : "currently NOT covered (a gap)"
      }. Questions like "this standard" or informal paraphrases of it refer to ${expandedStd.id}.`;
    }
    setPageContext(ctx.slice(0, 2000));
    return () => setPageContext("");
  }, [rows, grade, view, onlyGaps, expanded, setPageContext]);
  const shown = onlyGaps ? gradeRows.filter((s) => !s.covered) : gradeRows;
  const coveredCount = gradeRows.filter((s) => s.covered).length;

  // Vertical alignment: strand rows × grade columns.
  const strandNames = [...new Map(rows.map((s) => [s.strandCode, s.strandName])).entries()];

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <span className="text-sm text-zinc-400">Loading standards...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Standards</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Where each standard is taught — and what isn&apos;t covered yet
            </p>
          </div>
          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
            {(["coverage", "vertical"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`text-xs font-medium rounded-md px-3 py-1.5 transition-colors ${
                  view === v
                    ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                {v === "coverage" ? "Coverage" : "Vertical alignment"}
              </button>
            ))}
          </div>
        </div>

        {view === "coverage" ? (
          <>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1">
                {grades.map((g) => (
                  <button
                    key={g}
                    onClick={() => setGrade(g)}
                    className={`text-xs font-medium rounded-md px-3 py-1.5 transition-colors ${
                      grade === g
                        ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                    }`}
                  >
                    Grade {g}
                  </button>
                ))}
              </div>
              <span className="text-xs text-zinc-400">
                {coveredCount}/{gradeRows.length} covered
              </span>
              <label className="flex items-center gap-1.5 text-xs text-zinc-500 cursor-pointer ml-auto">
                <input
                  type="checkbox"
                  checked={onlyGaps}
                  onChange={(e) => setOnlyGaps(e.target.checked)}
                  className="rounded border-zinc-300 dark:border-zinc-600"
                />
                Gaps only
              </label>
            </div>

            <div className="space-y-1.5">
              {shown.map((s) => (
                <div
                  key={s.id}
                  className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
                >
                  <button
                    onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                    className="w-full text-left px-4 py-2.5 flex items-start gap-3"
                  >
                    <span
                      className={`mt-0.5 shrink-0 w-2 h-2 rounded-full ${
                        s.covered ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"
                      }`}
                      title={s.covered ? "Covered" : "Not covered"}
                    />
                    <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400 shrink-0 w-20">
                      {s.id}
                    </span>
                    <span className="text-xs text-zinc-700 dark:text-zinc-300 flex-1 min-w-0">
                      {s.description.length > 160 && expanded !== s.id
                        ? s.description.slice(0, 160) + "…"
                        : s.description}
                    </span>
                    <span className="text-[10px] text-zinc-400 shrink-0">
                      {s.units.length + s.lessons.length > 0 &&
                        `${s.units.length + s.lessons.length} link${s.units.length + s.lessons.length === 1 ? "" : "s"}`}
                    </span>
                  </button>
                  {expanded === s.id && (s.units.length > 0 || s.lessons.length > 0) && (
                    <div className="px-4 pb-3 pl-9 space-y-1">
                      {s.units.map((u) => (
                        <Link
                          key={`u-${u.unitId}`}
                          href={`/curriculum/${u.unitId}`}
                          className="block text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {u.quarter ? `${u.quarter} · ` : ""}Unit: {u.unitTitle}
                        </Link>
                      ))}
                      {s.lessons.map((l) => (
                        <Link
                          key={`l-${l.lessonId}`}
                          href={`/curriculum/${l.unitId}`}
                          className="block text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {l.quarter ? `${l.quarter} · ` : ""}
                          {l.unitTitle} — {l.lessonTitle}
                          {l.coverageType ? ` (${l.coverageType})` : ""}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {shown.length === 0 && (
                <p className="text-sm text-zinc-400 py-8 text-center">
                  {onlyGaps ? "No gaps — every standard is covered." : "No standards found."}
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left">
                  <th className="px-4 py-2.5 font-medium text-zinc-500">Strand</th>
                  {grades.map((g) => (
                    <th key={g} className="px-4 py-2.5 font-medium text-zinc-500 text-center">
                      Grade {g}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {strandNames.map(([code, name]) => (
                  <tr key={code} className="border-b border-zinc-100 dark:border-zinc-800/60 last:border-0">
                    <td className="px-4 py-2.5 text-zinc-700 dark:text-zinc-300">
                      <span className="font-mono text-zinc-400 mr-2">{code}</span>
                      {name}
                    </td>
                    {grades.map((g) => {
                      const cell = rows.filter((s) => s.grade === g && s.strandCode === code);
                      const cov = cell.filter((s) => s.covered).length;
                      const pct = cell.length ? cov / cell.length : 0;
                      return (
                        <td key={g} className="px-4 py-2.5 text-center">
                          {cell.length === 0 ? (
                            <span className="text-zinc-300 dark:text-zinc-700">—</span>
                          ) : (
                            <span
                              className={`inline-block rounded-full px-2 py-0.5 font-medium ${
                                pct === 1
                                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                                  : pct > 0
                                    ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                                    : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                              }`}
                              title={`${cov} of ${cell.length} covered`}
                            >
                              {cov}/{cell.length}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
