"use client";

// /calendar — the whole teaching week at a glance: ONE ROW PER SECTION
// (class period), Mon–Fri columns, real dates. Grade lives on the row label,
// not the page header (Jason 2026-07-31). A course with no sections yet shows
// as a single course row, so the calendar works before sections are set up.
//
// Sections currently share their course's plan and pacing — both Grade 8
// periods show the same lessons on the same days. Per-section drift
// (section-specific snow days, faster/slower classes) is the future
// actual-vs-planned feature; this view makes the concept visible first.
// Per-course settings (quarter dates, snow days) live on the course
// calendar — the row's "Open" link.

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  placeLessons,
  parseMeetingDays,
  defaultQuarterSpans,
  weekStart,
  addDays,
  isoWeekday,
  type QuarterSpan,
  type PlacedLesson,
} from "@/lib/schedule";
import { useCopilot } from "@/components/CopilotProvider";

const QUARTER_BARS: Record<string, string> = {
  Summer: "bg-orange-400 dark:bg-orange-500",
  Q1: "bg-blue-400 dark:bg-blue-500",
  Q2: "bg-violet-400 dark:bg-violet-500",
  Q3: "bg-teal-400 dark:bg-teal-500",
  Q4: "bg-amber-400 dark:bg-amber-500",
};
const GRADE_ROW_COLORS: Record<number, string> = {
  6: "border-l-teal-400 dark:border-l-teal-500",
  7: "border-l-blue-400 dark:border-l-blue-500",
  8: "border-l-violet-400 dark:border-l-violet-500",
};
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

type Lesson = { id: string; title: string; sortOrder: number; materialCount: number };
type Unit = {
  id: string;
  title: string;
  quarter: string | null;
  sortOrder: number;
  durationWeeks: number;
  lessons: Lesson[];
};
type Course = { id: string; title: string; grade: number; schoolYearId: string | null };
type SchoolYear = { id: string; name: string; isCurrent: boolean };
type Section = {
  id: string;
  name: string;
  period: string | null;
  courseId: string;
  grade: number;
};
type CourseCalendar = {
  byDate: Map<string, { p: PlacedLesson<Lesson>; dayIndex: number }[]>;
  meetingDays: Set<number>;
  noSchool: Map<string, string>;
  estimated: boolean;
};

function fmt(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function CalendarPage() {
  const { setPageContext } = useCopilot();
  const [courses, setCourses] = useState<Course[]>([]);
  const [years, setYears] = useState<SchoolYear[]>([]);
  const [sectionsList, setSectionsList] = useState<Section[]>([]);
  const [calendars, setCalendars] = useState<Map<string, CourseCalendar>>(new Map());
  const [loading, setLoading] = useState(true);
  const [manageOpen, setManageOpen] = useState(false);
  const [newSection, setNewSection] = useState<{ courseId: string; name: string; period: string }>(
    { courseId: "", name: "", period: "" },
  );
  const [busy, setBusy] = useState(false);
  const [viewMonday, setViewMonday] = useState<string>(() =>
    weekStart(new Date().toISOString().slice(0, 10)),
  );

  async function loadSections() {
    const res = await fetch("/api/sections");
    if (res.ok) {
      const data = await res.json();
      setSectionsList(data.sections ?? []);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const [coursesRes, sectionsRes] = await Promise.all([
          fetch("/api/courses"),
          fetch("/api/sections"),
        ]);
        const coursesData = await coursesRes.json();
        const sectionsData = sectionsRes.ok ? await sectionsRes.json() : { sections: [] };
        const allCourses: Course[] = coursesData.courses ?? [];
        const allYears: SchoolYear[] = coursesData.schoolYears ?? [];
        const currentYearId = allYears.find((y) => y.isCurrent)?.id ?? null;
        // The calendar shows the current (planning) year's courses.
        const currentCourses = currentYearId
          ? allCourses.filter((c) => c.schoolYearId === currentYearId)
          : allCourses;
        setCourses(currentCourses);
        setYears(allYears);
        setSectionsList(sectionsData.sections ?? []);

        // Per-course data → pure placement, computed once per course.
        const cals = new Map<string, CourseCalendar>();
        let firstStart = null as string | null;
        await Promise.all(
          currentCourses.map(async (c) => {
            const [dataRes, schedRes] = await Promise.all([
              fetch(`/api/curriculum/editor/data?courseId=${c.id}`),
              fetch(`/api/schedule/${c.id}`),
            ]);
            if (!dataRes.ok || !schedRes.ok) return;
            const data = await dataRes.json();
            const sched = await schedRes.json();
            const units: Unit[] = data.units ?? [];
            let spans: QuarterSpan[] = sched.quarterSpans ?? [];
            let estimated = false;
            if (spans.length === 0 && sched.schoolYear) {
              spans = defaultQuarterSpans(sched.schoolYear.startDate, sched.schoolYear.endDate);
              estimated = true;
            }
            const meetingDays = parseMeetingDays(sched.meetingDays);
            const noSchoolArr: { date: string; label: string }[] = sched.noSchoolDays ?? [];
            const noSchoolSet = new Set(noSchoolArr.map((d) => d.date));
            const placed = placeLessons(units, spans, meetingDays, noSchoolSet);
            const byDate = new Map<string, { p: PlacedLesson<Lesson>; dayIndex: number }[]>();
            for (const p of placed) {
              p.dates.forEach((date, i) => {
                const arr = byDate.get(date) ?? [];
                arr.push({ p, dayIndex: i });
                byDate.set(date, arr);
              });
            }
            cals.set(c.id, {
              byDate,
              meetingDays,
              noSchool: new Map(noSchoolArr.map((d) => [d.date, d.label])),
              estimated,
            });
            if (spans[0]?.startDate && (!firstStart || spans[0].startDate < firstStart)) {
              firstStart = spans[0].startDate;
            }
          }),
        );
        setCalendars(cals);
        // Land on the earliest scheduled week rather than an empty "today".
        const today = new Date().toISOString().slice(0, 10);
        if (firstStart && today < firstStart) setViewMonday(weekStart(firstStart));
      } catch (err) {
        console.error("Failed to load calendar", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Rows: one per section; courses without sections get a course row ───
  const rows = useMemo(() => {
    const out: { key: string; label: string; sub: string; course: Course; sectionId?: string }[] =
      [];
    for (const c of courses) {
      const secs = sectionsList.filter((s) => s.courseId === c.id);
      if (secs.length === 0) {
        out.push({ key: c.id, label: `Grade ${c.grade}`, sub: "whole course", course: c });
      } else {
        for (const s of secs) {
          out.push({
            key: s.id,
            label: `Grade ${c.grade} — ${s.name}`,
            sub: s.period ? `Period ${s.period}` : "section",
            course: c,
            sectionId: s.id,
          });
        }
      }
    }
    return out;
  }, [courses, sectionsList]);

  useEffect(() => {
    setPageContext(
      `The teacher is looking at the all-sections week calendar (week of ${viewMonday}): ${rows.length} row(s) — ${rows.map((r) => r.label).join(", ")}. Sections share their course's plan; per-section pacing drift isn't modeled yet.`,
    );
    return () => setPageContext("");
  }, [rows, viewMonday, setPageContext]);

  const weekDates = [0, 1, 2, 3, 4].map((i) => addDays(viewMonday, i));
  const todayIso = new Date().toISOString().slice(0, 10);
  const anyEstimated = [...calendars.values()].some((c) => c.estimated);

  async function addSection() {
    if (!newSection.courseId || !newSection.name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: newSection.courseId,
          name: newSection.name.trim(),
          period: newSection.period.trim() || undefined,
        }),
      });
      if (res.ok) {
        setNewSection((p) => ({ ...p, name: "", period: "" }));
        await loadSections();
      }
    } finally {
      setBusy(false);
    }
  }

  async function removeSection(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/sections?id=${id}`, { method: "DELETE" });
      await loadSections();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-10">
        <span className="text-sm text-zinc-400 animate-pulse">Loading calendar…</span>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Calendar</h1>
        <button
          onClick={() => setManageOpen((v) => !v)}
          className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 rounded-lg px-3 py-1.5 transition-colors"
        >
          {manageOpen ? "Hide sections" : "Manage sections"}
        </button>
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
        One row per section.{" "}
        {anyEstimated && (
          <span className="text-amber-600 dark:text-amber-400 font-medium">
            Some quarter dates are estimates — set real dates from a row&apos;s Open link.
          </span>
        )}
      </p>

      {manageOpen && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 mb-5">
          <h2 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Sections</h2>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <select
              value={newSection.courseId}
              onChange={(e) => setNewSection((p) => ({ ...p, courseId: e.target.value }))}
              className="rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-[11px] text-zinc-700 dark:text-zinc-300"
            >
              <option value="">Course…</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  Grade {c.grade} — {c.title}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={newSection.name}
              onChange={(e) => setNewSection((p) => ({ ...p, name: e.target.value }))}
              placeholder="Section name (e.g. Period 1)"
              className="w-44 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-[11px] text-zinc-700 dark:text-zinc-300"
            />
            <input
              type="text"
              value={newSection.period}
              onChange={(e) => setNewSection((p) => ({ ...p, period: e.target.value }))}
              placeholder="Period #"
              className="w-20 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-[11px] text-zinc-700 dark:text-zinc-300"
            />
            <button
              onClick={addSection}
              disabled={busy || !newSection.courseId || !newSection.name.trim()}
              className="text-[11px] font-semibold text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 rounded px-2.5 py-1 disabled:opacity-40"
            >
              Add section
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {sectionsList.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2.5 py-0.5 text-[11px] text-zinc-700 dark:text-zinc-300"
              >
                Grade {s.grade} — {s.name}
                <button
                  onClick={() => removeSection(s.id)}
                  disabled={busy}
                  className="text-zinc-400 hover:text-red-500"
                  aria-label={`Delete ${s.name}`}
                >
                  ×
                </button>
              </span>
            ))}
            {sectionsList.length === 0 && (
              <span className="text-[11px] text-zinc-400">
                No sections yet — a course without sections shows as one row.
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Week navigation ── */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => setViewMonday(weekStart(todayIso))}
          className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 rounded-lg px-3 py-1.5"
        >
          Today
        </button>
        <button
          onClick={() => setViewMonday((m) => addDays(m, -7))}
          aria-label="Previous week"
          className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 rounded-lg px-2.5 py-1.5"
        >
          ←
        </button>
        <button
          onClick={() => setViewMonday((m) => addDays(m, 7))}
          aria-label="Next week"
          className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 rounded-lg px-2.5 py-1.5"
        >
          →
        </button>
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {fmt(weekDates[0])} – {fmt(weekDates[4])}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No courses in the current school year yet —{" "}
          <Link href="/curriculum" className="underline">
            start from the year view
          </Link>
          .
        </p>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            {/* Column headers */}
            <div className="grid gap-2 mb-2" style={{ gridTemplateColumns: "11rem repeat(5, 1fr)" }}>
              <div />
              {weekDates.map((date, i) => (
                <div
                  key={date}
                  className={`text-xs font-bold px-1 ${
                    date === todayIso
                      ? "text-zinc-900 dark:text-zinc-50"
                      : "text-zinc-500 dark:text-zinc-400"
                  }`}
                >
                  {DAY_LABELS[i]} <span className="font-normal">{fmt(date)}</span>
                </div>
              ))}
            </div>

            {/* One row per section */}
            <div className="space-y-2">
              {rows.map((row) => {
                const cal = calendars.get(row.course.id);
                return (
                  <div
                    key={row.key}
                    className="grid gap-2"
                    style={{ gridTemplateColumns: "11rem repeat(5, 1fr)" }}
                  >
                    <div
                      className={`rounded-lg border border-l-4 ${GRADE_ROW_COLORS[row.course.grade] ?? "border-l-zinc-400"} border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 flex flex-col justify-center`}
                    >
                      <span className="text-xs font-bold text-zinc-900 dark:text-zinc-50 leading-tight">
                        {row.label}
                      </span>
                      <span className="text-[10px] text-zinc-400">{row.sub}</span>
                      <Link
                        href={`/curriculum/calendar/${row.course.id}`}
                        className="text-[10px] font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 mt-0.5"
                      >
                        Open →
                      </Link>
                    </div>
                    {weekDates.map((date) => {
                      const isMeeting = cal?.meetingDays.has(isoWeekday(date)) ?? false;
                      const noSchoolLabel = cal?.noSchool.get(date);
                      const dayLessons = cal?.byDate.get(date) ?? [];
                      return (
                        <div
                          key={date}
                          className={`rounded-lg border min-h-16 p-1.5 space-y-1 ${
                            date === todayIso
                              ? "border-zinc-400 dark:border-zinc-500"
                              : "border-zinc-200 dark:border-zinc-800"
                          } ${!isMeeting || noSchoolLabel ? "bg-zinc-50/50 dark:bg-zinc-900/40" : "bg-white dark:bg-zinc-900"}`}
                        >
                          {noSchoolLabel ? (
                            <span className="text-[10px] font-medium text-red-600 dark:text-red-400">
                              {noSchoolLabel}
                            </span>
                          ) : !isMeeting ? (
                            <span className="text-[10px] italic text-zinc-300 dark:text-zinc-600">
                              no class
                            </span>
                          ) : dayLessons.length === 0 ? (
                            <span className="text-[10px] italic text-zinc-300 dark:text-zinc-600">
                              —
                            </span>
                          ) : (
                            dayLessons.map(({ p, dayIndex }) => (
                              <Link
                                key={`${p.lesson.id}-${dayIndex}`}
                                href={`/curriculum/${p.unitId}`}
                                className={`block rounded-md border border-zinc-200 dark:border-zinc-700 overflow-hidden hover:border-zinc-400 dark:hover:border-zinc-500 transition-colors ${p.overflow ? "ring-1 ring-red-300 dark:ring-red-800" : ""}`}
                              >
                                <div className={`h-0.5 ${QUARTER_BARS[p.quarter] ?? "bg-zinc-300"}`} />
                                <div className="px-1.5 py-1">
                                  <div className="text-[10px] text-zinc-800 dark:text-zinc-200 leading-snug">
                                    {p.lesson.title}
                                  </div>
                                  {p.dayCount > 1 && (
                                    <div className="text-[9px] text-zinc-400">
                                      day {dayIndex + 1}/{p.dayCount}
                                    </div>
                                  )}
                                </div>
                              </Link>
                            ))
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <p className="text-[11px] text-zinc-400 mt-4">
        Sections share their course&apos;s plan for now — per-section pacing (a section falling
        behind, its own snow days) comes with actual-vs-planned tracking. Snow days and quarter
        dates are set on each course&apos;s calendar (Open →).
        {years.length > 0 && ""}
      </p>
    </div>
  );
}
