"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

type FileRow = { title: string; materialType: string; category: string };
type QuarterSummary = {
  quarter: string;
  total: number;
  categories: Record<string, number>;
  files: FileRow[];
  built: boolean;
  // Imported after the quarter was built. Before this existed, such material
  // was invisible here AND unbuildable: the built card offered only "Open",
  // and Rebuild lived behind a Build button that built quarters never render.
  newSinceBuild: number;
};
type GradeSummary = {
  grade: number;
  total: number;
  quarters: QuarterSummary[];
  courseId: string | null;
};

const ALL_QUARTERS = ["Summer", "Q1", "Q2", "Q3", "Q4"];

// Year Plan is deliberately NOT in ALL_QUARTERS: it isn't a quarter and never
// gets built into units. It's grade-level reference read on every build, so it
// gets its own strip below the grid rather than a sixth card with a dead
// "Build →" affordance.
const YEAR_PLAN = "YearPlan";

const QUARTER_STYLES: Record<string, string> = {
  // Summer = pre-year bucket; warm orange sets it apart from the graded quarters.
  Summer: "border-l-orange-400 dark:border-l-orange-500",
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
  // When a quarter is already built, the server returns { alreadyBuilt } instead
  // of duplicating it. We surface Open / Rebuild here rather than silently acting.
  const [alreadyBuilt, setAlreadyBuilt] = useState<{ quarter: string; courseId: string } | null>(
    null,
  );
  // Optional pacing guide / schedule the teacher can paste to steer the build.
  const [referenceText, setReferenceText] = useState("");

  async function buildQuarter(
    grade: number,
    quarter: string,
    reference: string,
    rebuild = false,
  ) {
    setBuildingQuarter(quarter);
    setBuildError(null);
    setAlreadyBuilt(null);
    try {
      const res = await fetch("/api/import/build-curriculum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grade,
          quarter,
          referenceText: reference.trim() || undefined,
          rebuild: rebuild || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBuildError(data.error ?? `Build failed (error ${res.status}).`);
        setBuildingQuarter(null);
        return;
      }
      // This quarter was already built — don't duplicate it. Offer Open / Rebuild.
      if (data.alreadyBuilt) {
        setAlreadyBuilt({ quarter, courseId: data.courseId });
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
            Staging for quarters that aren&apos;t built yet. Built quarters live in your
            curriculum — their files are in the content pool.
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

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {ALL_QUARTERS.map((qk) => {
          const q = byQuarter.get(qk);
          const total = q?.total ?? 0;
          const isEmpty = total === 0;
          const isBuilt = q?.built ?? false;
          const isNew = q?.newSinceBuild ?? 0;
          const isOpen = expanded === qk;

          // #604: a built quarter has graduated — its files live in the
          // curriculum and the pool. Show a quiet done-state (so the import
          // history isn't amnesiac), not the staging ledger.
          if (isBuilt) {
            return (
              <div
                key={qk}
                className={`rounded-lg border border-l-4 ${QUARTER_STYLES[qk]} border-zinc-200 dark:border-zinc-800 bg-transparent p-3`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    {qk}
                  </span>
                  <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                    ✓ built
                  </span>
                </div>
                {isNew > 0 ? (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1 leading-snug">
                    {isNew} file{isNew === 1 ? "" : "s"} imported since — not in the
                    curriculum yet
                  </p>
                ) : (
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">
                    in curriculum
                  </p>
                )}
                <div className="mt-1.5 flex items-center gap-2">
                  <button
                    onClick={() =>
                      router.push(
                        grade.courseId ? `/curriculum/edit/${grade.courseId}?quarter=${qk}` : "/curriculum",
                      )
                    }
                    className="text-[11px] font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
                  >
                    Open →
                  </button>
                  {/* A built quarter used to be a dead end: no ledger, no Build
                      button, and Rebuild only reachable through the Build button
                      it never rendered. Anything imported afterwards could not be
                      built in at all. */}
                  {buildingQuarter === qk ? (
                    <span className="text-[11px] font-medium text-zinc-400 animate-pulse">
                      Rebuilding…
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmingBuild(qk)}
                      disabled={buildingQuarter !== null}
                      className={`text-[11px] font-medium disabled:opacity-40 transition-colors ${
                        isNew > 0
                          ? "font-semibold text-amber-700 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300"
                          : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                      }`}
                    >
                      Rebuild
                    </button>
                  )}
                </div>
                {confirmingBuild === qk && buildingQuarter === null && (
                  <div className="mt-2 rounded-md border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20 p-2 space-y-1.5">
                    <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-snug">
                      Rebuild {qk} from all {total} files? This discards the current
                      {" "}{qk} units and lessons and builds them again from your
                      folders. Any edits you made to {qk} are lost.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setConfirmingBuild(null);
                          buildQuarter(grade.grade, qk, "", true);
                        }}
                        className="text-[11px] font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded px-2 py-0.5 transition-colors"
                      >
                        Rebuild {qk}
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
              </div>
            );
          }

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
                        Build {qk}&apos;s {total} files into units? You can rebuild
                        later to replace it if the result needs a redo.
                      </p>
                      <textarea
                        value={referenceText}
                        onChange={(e) => setReferenceText(e.target.value)}
                        placeholder="Optional: paste a pacing guide or class schedule to guide pacing and ordering…"
                        rows={2}
                        className="w-full rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-[11px] text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setConfirmingBuild(null);
                            buildQuarter(grade.grade, qk, referenceText);
                            setReferenceText("");
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
                  {alreadyBuilt?.quarter === qk && (
                    <div className="mt-2 rounded-md border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20 p-2 space-y-1.5">
                      <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-snug">
                        {qk} is already built. Open it to edit, or rebuild to replace
                        it — rebuilding discards the current {qk} units and lessons.
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => router.push(`/curriculum/edit/${alreadyBuilt.courseId}`)}
                          className="text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded px-2 py-0.5 transition-colors"
                        >
                          Open {qk}
                        </button>
                        <button
                          onClick={() => buildQuarter(grade.grade, qk, "", true)}
                          className="text-[11px] font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
                        >
                          Rebuild (replaces)
                        </button>
                        <button
                          onClick={() => setAlreadyBuilt(null)}
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

      {(() => {
        const yp = byQuarter.get(YEAR_PLAN);
        const isOpen = expanded === YEAR_PLAN;
        return (
          <div
            className={`mt-3 rounded-lg border border-l-4 border-l-indigo-400 dark:border-l-indigo-500 ${
              yp
                ? "border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40"
                : "border-dashed border-zinc-200 dark:border-zinc-800 bg-transparent"
            } px-3 py-2`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Year Plan
                </span>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {yp
                    ? `${yp.total} ${yp.total === 1 ? "file" : "files"} · read as reference every time you build a quarter of Grade ${grade.grade}`
                    : "None yet. Import your plan for the year here and every build of this grade will follow it."}
                </p>
              </div>
              {yp && (
                <button
                  onClick={() => setExpanded(isOpen ? null : YEAR_PLAN)}
                  className="shrink-0 text-[11px] font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
                >
                  {isOpen ? "Hide files" : "See files"}
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {buildError && (
        <div className="mt-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-2.5 text-xs text-red-700 dark:text-red-300">
          {buildError}
        </div>
      )}

      {expanded && byQuarter.get(expanded) && (
        <div className="mt-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 p-3 max-h-56 overflow-y-auto">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 mb-2">
            {expanded === YEAR_PLAN ? "Year Plan" : expanded} files (
            {byQuarter.get(expanded)!.total})
          </p>
          <div className="space-y-1">
            {byQuarter.get(expanded)!.files.map((f, i) => (
              <div key={i} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-zinc-700 dark:text-zinc-300 truncate">{f.title}</span>
                <span className="text-[10px] text-zinc-400 shrink-0">
                  {/* Year Plan files have no category — the bucket has no subfolders. */}
                  {expanded === YEAR_PLAN ? f.materialType : `${f.category} · ${f.materialType}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
