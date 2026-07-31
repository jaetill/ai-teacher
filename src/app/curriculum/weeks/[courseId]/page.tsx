"use client";

// PROTOTYPE — "My lessons by week" (Atlas-style), read-only.
//
// Lays the year out as consecutive weeks per quarter, dealing each unit's
// lessons across its stated duration with the same groupLessonsByWeek the
// editor uses (#627 lineage), so this view and the editor can't disagree.
//
// Honest limits, on purpose: there are no real dates or per-lesson day counts
// in the schema yet, so this is SYNTHETIC pacing — the week a lesson lands in
// is arithmetic, not reality. Real calendars (start dates, holidays, bump-
// forward on lost days) are the #646 feature; day-count capture is #627. This
// page exists to feel out the layout before we invest in that machinery.

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { groupLessonsByWeek } from "@/lib/group-lessons";
import { useCopilot } from "@/components/CopilotProvider";

const QUARTER_ORDER = ["Summer", "Q1", "Q2", "Q3", "Q4"];

const QUARTER_STYLES: Record<string, { border: string; badge: string }> = {
  Summer: { border: "border-l-orange-400 dark:border-l-orange-500", badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  Q1: { border: "border-l-blue-400 dark:border-l-blue-500", badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  Q2: { border: "border-l-violet-400 dark:border-l-violet-500", badge: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" },
  Q3: { border: "border-l-teal-400 dark:border-l-teal-500", badge: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300" },
  Q4: { border: "border-l-amber-400 dark:border-l-amber-500", badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
};

type Lesson = {
  id: string;
  title: string;
  sortOrder: number;
  durationMinutes: number | null;
  source: string;
  materialCount: number;
};

type Unit = {
  id: string;
  title: string;
  quarter: string | null;
  sortOrder: number;
  durationWeeks: number;
  summary: string;
  lessons: Lesson[];
};

type WeekRow = {
  week: number; // continuous within the quarter
  unitId: string;
  unitTitle: string;
  unitWeek: number; // week within the unit ("wk 2 of 4")
  unitWeeks: number;
  lessons: Lesson[];
};

export default function WeeksPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const { setPageContext } = useCopilot();
  const [course, setCourse] = useState<{ id: string; title: string; grade: number } | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/curriculum/editor/data?courseId=${courseId}`);
        if (!res.ok) throw new Error(`API error ${res.status}`);
        const data = await res.json();
        setCourse(data.course ?? null);
        setUnits(data.units ?? []);
      } catch (err) {
        console.error("Failed to load week view", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [courseId]);

  useEffect(() => {
    if (!course) return;
    setPageContext(
      `The teacher is looking at the week-by-week view of Grade ${course.grade} (${course.title}): every unit's lessons dealt across its stated duration, quarter by quarter. Pacing here is synthetic (no real dates yet).`,
    );
    return () => setPageContext("");
  }, [course, setPageContext]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-10">
        <span className="text-sm text-zinc-400 animate-pulse">Loading week view…</span>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-10">
        <p className="text-sm text-zinc-500">Course not found.</p>
      </div>
    );
  }

  // Build per-quarter week rows with a continuous week counter.
  const quarters = QUARTER_ORDER.map((q) => {
    const quarterUnits = units
      .filter((u) => u.quarter === q)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const rows: WeekRow[] = [];
    let weekCounter = 0;
    for (const u of quarterUnits) {
      const grouped = groupLessonsByWeek(u.lessons, u.durationWeeks);
      for (const g of grouped) {
        weekCounter += 1;
        rows.push({
          week: weekCounter,
          unitId: u.id,
          unitTitle: u.title,
          unitWeek: g.week,
          unitWeeks: Math.max(u.durationWeeks, grouped.length),
          lessons: g.lessons,
        });
      }
    }
    return { quarter: q, rows, unitCount: quarterUnits.length };
  }).filter((q) => q.rows.length > 0);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
          Grade {course.grade} — lessons by week
        </h1>
        <Link
          href="/curriculum"
          className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
        >
          ← Year view
        </Link>
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-6 max-w-2xl">
        <span className="font-semibold text-amber-600 dark:text-amber-400">Prototype.</span>{" "}
        Weeks are dealt evenly from each unit&apos;s stated duration — synthetic pacing, not
        real dates. A true calendar (start dates, holidays, bumping) comes later.
      </p>

      {quarters.length === 0 && (
        <p className="text-sm text-zinc-500">No units with lessons yet.</p>
      )}

      <div className="space-y-8">
        {quarters.map(({ quarter, rows, unitCount }) => {
          const qs = QUARTER_STYLES[quarter];
          return (
            <section key={quarter}>
              <div className="flex items-baseline gap-2 mb-3">
                <span className={`text-[11px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${qs?.badge ?? ""}`}>
                  {quarter}
                </span>
                <span className="text-xs text-zinc-400">
                  {rows.length} week{rows.length === 1 ? "" : "s"} · {unitCount} unit
                  {unitCount === 1 ? "" : "s"}
                </span>
              </div>
              <div className={`rounded-xl border border-l-4 ${qs?.border ?? ""} border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 divide-y divide-zinc-100 dark:divide-zinc-800`}>
                {rows.map((row) => (
                  <div key={`${row.unitId}-${row.unitWeek}`} className="flex gap-4 px-4 py-3">
                    <div className="w-28 shrink-0">
                      <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                        Week {row.week}
                      </div>
                      <div className="text-[11px] text-zinc-400 truncate" title={row.unitTitle}>
                        {row.unitTitle}
                      </div>
                      <div className="text-[10px] text-zinc-400/80">
                        wk {row.unitWeek} of {row.unitWeeks}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      {row.lessons.length === 0 ? (
                        <span className="text-[11px] italic text-zinc-400">
                          unscheduled — no lessons dealt to this week
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {row.lessons.map((l) => (
                            <Link
                              key={l.id}
                              href={`/curriculum/${row.unitId}`}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 px-2.5 py-1 text-xs text-zinc-700 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-500 transition-colors max-w-full"
                            >
                              <span className="truncate">{l.title}</span>
                              {l.materialCount > 0 && (
                                <span className="text-[10px] text-zinc-400 shrink-0">
                                  {l.materialCount} 📎
                                </span>
                              )}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
