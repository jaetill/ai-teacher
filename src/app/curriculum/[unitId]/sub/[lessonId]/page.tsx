"use client";

// Substitute plan one-pager: everything a sub needs for one lesson, composed
// read-only from existing data (lesson plan, objectives, linked materials,
// teacher notes) with room for day-of notes. Designed to read cleanly on
// screen or paper; writes nothing.

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type MaterialLink = {
  title: string;
  materialType: string;
  driveWebUrl: string | null;
  role: string;
};

type Lesson = {
  id: string;
  title: string;
  sortOrder: number;
  durationMinutes: number | null;
  objectives: string[] | null;
  lessonPlan: Record<string, unknown>;
  teacherNotes: string | null;
  materials: MaterialLink[];
};

type UnitDetail = {
  id: string;
  title: string;
  grade: number;
  quarter: string | null;
  courseTitle: string;
  lessons: Lesson[];
};

export default function SubPlanPage() {
  const { unitId, lessonId } = useParams<{ unitId: string; lessonId: string }>();
  const [unit, setUnit] = useState<UnitDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/units/${unitId}`);
        const data = await res.json();
        setUnit(data.unit ?? null);
      } catch (err) {
        console.error("Failed to load unit", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [unitId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <span className="text-sm text-zinc-400">Loading sub plan...</span>
      </div>
    );
  }

  const lesson = unit?.lessons.find((l) => l.id === lessonId);
  if (!unit || !lesson) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-sm text-zinc-500">Lesson not found.</p>
          <Link href="/curriculum" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
            Back to curriculum
          </Link>
        </div>
      </div>
    );
  }

  const activities = (lesson.lessonPlan as { activities?: string[] })?.activities;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <nav className="flex items-center gap-1.5 text-xs text-zinc-400">
          <Link href={`/curriculum/${unit.id}`} className="hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">
            ← {unit.title}
          </Link>
        </nav>

        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-8 space-y-6">
          {/* Header */}
          <div className="border-b border-zinc-200 dark:border-zinc-800 pb-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">
              Substitute Plan
            </p>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{lesson.title}</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Grade {unit.grade} English{unit.quarter ? ` · ${unit.quarter}` : ""} · Unit: {unit.title}
              {lesson.durationMinutes ? ` · ${lesson.durationMinutes} min` : ""}
            </p>
            <p className="text-sm text-zinc-400 mt-3">
              Date: ______________________ &nbsp;&nbsp; Class period: __________
            </p>
          </div>

          {/* Objectives */}
          {lesson.objectives && lesson.objectives.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-2">
                What students are working on
              </h2>
              <ul className="space-y-1">
                {lesson.objectives.map((o, i) => (
                  <li key={i} className="text-sm text-zinc-600 dark:text-zinc-400 pl-4 relative">
                    <span className="absolute left-0">•</span>
                    {o}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Plan */}
          {activities && activities.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-2">
                Lesson plan
              </h2>
              <ol className="space-y-1.5">
                {activities.map((a, i) => (
                  <li key={i} className="text-sm text-zinc-600 dark:text-zinc-400 pl-6 relative">
                    <span className="absolute left-0 text-zinc-400">{i + 1}.</span>
                    {a}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* Materials */}
          {lesson.materials.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-2">
                Materials
              </h2>
              <ul className="space-y-1">
                {lesson.materials.map((m, i) => (
                  <li key={i} className="text-sm text-zinc-600 dark:text-zinc-400 flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-zinc-400 w-20 shrink-0">
                      {m.materialType}
                    </span>
                    {m.driveWebUrl ? (
                      <a
                        href={m.driveWebUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {m.title}
                      </a>
                    ) : (
                      m.title
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Teacher notes */}
          {lesson.teacherNotes && (
            <section>
              <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-2">
                Notes from the teacher
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap">
                {lesson.teacherNotes}
              </p>
            </section>
          )}

          {/* Day-of notes */}
          <section>
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-2">
              How did it go? (for the sub)
            </h2>
            <div className="space-y-4 pt-1">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="border-b border-zinc-200 dark:border-zinc-700" />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
