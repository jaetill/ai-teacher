"use client";

// /calendar — the nav tab's landing spot. The calendar itself is per-course
// (/curriculum/calendar/[courseId]), so this resolver sends the teacher to
// the obvious one: if exactly one course sits in the current school year, go
// straight there; otherwise offer the short list.

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Course = { id: string; title: string; grade: number; schoolYearId: string | null };
type SchoolYear = { id: string; name: string; isCurrent: boolean };

export default function CalendarResolverPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [years, setYears] = useState<SchoolYear[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/courses");
        if (!res.ok) throw new Error(`API error ${res.status}`);
        const data = await res.json();
        const all: Course[] = data.courses ?? [];
        const yrs: SchoolYear[] = data.schoolYears ?? [];
        const currentYearId = yrs.find((y) => y.isCurrent)?.id ?? null;
        const currentCourses = currentYearId
          ? all.filter((c) => c.schoolYearId === currentYearId)
          : all;
        if (currentCourses.length === 1) {
          router.replace(`/curriculum/calendar/${currentCourses[0].id}`);
          return; // keep the loading state up through the redirect
        }
        setCourses(all);
        setYears(yrs);
        setLoading(false);
      } catch (err) {
        console.error("Failed to load courses", err);
        setLoading(false);
      }
    })();
  }, [router]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <span className="text-sm text-zinc-400 animate-pulse">Opening calendar…</span>
      </div>
    );
  }

  const yearName = (id: string | null) => years.find((y) => y.id === id)?.name ?? "no year";

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mb-1">Calendar</h1>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-6">
        Pick which course&apos;s calendar to open.
      </p>
      {courses.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No courses yet — <Link href="/import" className="underline">import materials</Link> to
          get started.
        </p>
      ) : (
        <div className="space-y-2">
          {courses.map((c) => (
            <Link
              key={c.id}
              href={`/curriculum/calendar/${c.id}`}
              className="block rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 hover:border-zinc-400 dark:hover:border-zinc-500 transition-colors"
            >
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Grade {c.grade} — {c.title}
              </span>
              <span className="ml-2 text-xs text-zinc-400">{yearName(c.schoolYearId)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
