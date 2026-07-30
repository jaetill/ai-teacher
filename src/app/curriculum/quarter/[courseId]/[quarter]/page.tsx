"use client";

// Read-only quarter view — the middle level of the year → quarter → unit
// browse hierarchy (#633 flow). Shows the quarter's units as cards linking
// into the unit view, with an "Edit this quarter" action that opens the
// existing editor scoped to this quarter. Browsing and editing stay distinct
// modes, mirroring the unit view.

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

const VALID_QUARTERS = ["Summer", "Q1", "Q2", "Q3", "Q4"];

const QUARTER_STYLES: Record<string, { border: string; badge: string }> = {
  Summer: { border: "border-l-orange-400 dark:border-l-orange-500", badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  Q1: { border: "border-l-blue-400 dark:border-l-blue-500", badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  Q2: { border: "border-l-violet-400 dark:border-l-violet-500", badge: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" },
  Q3: { border: "border-l-teal-400 dark:border-l-teal-500", badge: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300" },
  Q4: { border: "border-l-amber-400 dark:border-l-amber-500", badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
};

type UnitSummary = {
  id: string;
  title: string;
  sortOrder: number;
  quarter: string | null;
  durationWeeks: number;
  summary: string;
  contentWarnings: string | null;
  source: string;
};

type Course = {
  id: string;
  title: string;
  grade: number;
  schoolYearId: string | null;
  units: UnitSummary[];
};

type SchoolYearOption = { id: string; name: string; isCurrent: boolean };

export default function QuarterPage() {
  const { courseId, quarter } = useParams<{ courseId: string; quarter: string }>();
  const [course, setCourse] = useState<Course | null>(null);
  const [years, setYears] = useState<SchoolYearOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/courses");
        const data = await res.json();
        const match = (data.courses ?? []).find((c: Course) => c.id === courseId);
        setCourse(match ?? null);
        setYears(data.schoolYears ?? []);
      } catch (err) {
        console.error("Failed to load course", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [courseId]);

  const q = VALID_QUARTERS.includes(quarter) ? quarter : null;
  const qs = q ? QUARTER_STYLES[q] : undefined;
  const units = course && q ? course.units.filter((u) => u.quarter === q) : [];
  const totalWeeks = units.reduce((sum, u) => sum + (u.durationWeeks || 0), 0);
  const yearName = years.find((y) => y.id === course?.schoolYearId)?.name ?? null;

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <span className="text-sm text-zinc-400">Loading quarter...</span>
      </div>
    );
  }

  if (!course || !q) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-sm text-zinc-500">Quarter not found.</p>
          <Link href="/curriculum" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
            Back to curriculum
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-zinc-400">
          <Link href="/curriculum" className="hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">
            Curriculum
          </Link>
          <span>/</span>
          <Link href="/curriculum" className="hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">
            Grade {course.grade}
          </Link>
          <span>/</span>
          <span className="text-zinc-600 dark:text-zinc-300">{q}</span>
        </nav>

        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${qs?.badge ?? "bg-zinc-100 text-zinc-500"}`}>
                {q}
              </span>
              <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Grade {course.grade} — {course.title}
              </h1>
              {yearName && (
                <span className="text-sm font-normal text-zinc-400">{yearName}</span>
              )}
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              {units.length} {units.length === 1 ? "unit" : "units"}
              {totalWeeks > 0 && <> &middot; {totalWeeks} weeks planned</>}
            </p>
          </div>
          <Link
            href={`/curriculum/edit/${course.id}?quarter=${q}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg px-3 py-1.5 transition-colors shrink-0"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="opacity-60">
              <path d="M12.146.854a.5.5 0 01.708 0l2.292 2.292a.5.5 0 010 .708L5.854 13.146a.5.5 0 01-.233.131l-4 1a.5.5 0 01-.606-.606l1-4a.5.5 0 01.131-.232L12.146.854z" />
            </svg>
            Edit this quarter
          </Link>
        </div>

        {/* Units */}
        {units.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <p className="text-sm text-zinc-400">No units in {q} yet.</p>
            <Link
              href={`/curriculum/edit/${course.id}?quarter=${q}`}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Add one in the editor
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {units.map((unit) => (
              <Link
                key={unit.id}
                href={`/curriculum/${unit.id}`}
                className={`block rounded-xl border border-l-4 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-sm transition-all ${qs?.border ?? ""}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-zinc-400">{unit.durationWeeks} weeks</span>
                  {unit.source === "human" && (
                    <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 rounded-full px-2 py-0.5">
                      from docs
                    </span>
                  )}
                  {unit.contentWarnings && (
                    <span
                      className="text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-full px-2 py-0.5"
                      title={unit.contentWarnings}
                    >
                      content note
                    </span>
                  )}
                </div>
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {unit.title}
                </h2>
                {unit.summary && (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">
                    {unit.summary}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
