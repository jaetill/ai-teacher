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

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
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

// One colour per section (Atlas-style), so two sections of the same grade are
// still tellable apart. Sized for the 6-section worst case Jason named.
const SECTION_COLORS = [
  { dot: "bg-blue-500", header: "bg-blue-600", ring: "border-blue-600" },
  { dot: "bg-red-500", header: "bg-red-600", ring: "border-red-600" },
  { dot: "bg-emerald-500", header: "bg-emerald-600", ring: "border-emerald-600" },
  { dot: "bg-amber-500", header: "bg-amber-600", ring: "border-amber-600" },
  { dot: "bg-violet-500", header: "bg-violet-600", ring: "border-violet-600" },
  { dot: "bg-teal-500", header: "bg-teal-600", ring: "border-teal-600" },
];
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

type Lesson = {
  id: string;
  title: string;
  sortOrder: number;
  materialCount: number;
  objectives?: string[] | null;
  materials?: { title: string; driveWebUrl: string | null; role: string }[];
};
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
  meetingDays: string | null; // null = inherit the course's days
  courseId: string;
  grade: number;
};
// Raw per-course inputs. Placement is computed PER ROW (below) because a
// section can override which weekdays it meets (#669).
type CourseData = {
  units: Unit[];
  spans: QuarterSpan[];
  courseMeetingDays: string;
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
  const [courseData, setCourseData] = useState<Map<string, CourseData>>(new Map());
  const [loading, setLoading] = useState(true);
  const [manageOpen, setManageOpen] = useState(false);
  const [newSection, setNewSection] = useState<{ courseId: string; name: string; period: string }>(
    { courseId: "", name: "", period: "" },
  );
  const [busy, setBusy] = useState(false);
  // Courses captured for reloads that happen outside the bootstrap effect.
  const coursesRef = useRef<Course[]>([]);
  const [viewMonday, setViewMonday] = useState<string>(() =>
    weekStart(new Date().toISOString().slice(0, 10)),
  );

  // School-year settings (#646 follow-up, Jason): year dates, quarter dates and
  // no-school days are set ONCE here, not per course — they apply to every
  // section. Which weekdays a class meets stays per course (its calendar page).
  const [yearOpen, setYearOpen] = useState(false);
  const [yearForm, setYearForm] = useState<{
    id: string;
    name: string;
    startDate: string;
    endDate: string;
  } | null>(null);
  const [yearQuarters, setYearQuarters] = useState<QuarterSpan[]>([]);
  const [yearNoSchool, setYearNoSchool] = useState<{ date: string; label: string }[]>([]);
  const [newNoSchool, setNewNoSchool] = useState({ date: "", label: "Snow day" });
  const [yearSaveMsg, setYearSaveMsg] = useState<string | null>(null);

  async function loadYearSettings() {
    const res = await fetch("/api/school-year");
    if (!res.ok) return;
    const data = await res.json();
    const sy = data.schoolYear;
    if (!sy) return;
    setYearForm({ id: sy.id, name: sy.name, startDate: sy.startDate, endDate: sy.endDate });
    setYearQuarters(
      (data.quarterSpans ?? []).length > 0
        ? data.quarterSpans
        : defaultQuarterSpans(sy.startDate, sy.endDate),
    );
    setYearNoSchool(data.noSchoolDays ?? []);
  }

  async function saveYearSettings() {
    if (!yearForm) return;
    setBusy(true);
    setYearSaveMsg(null);
    try {
      const res = await fetch("/api/school-year", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolYearId: yearForm.id,
          startDate: yearForm.startDate,
          endDate: yearForm.endDate,
          quarterSpans: yearQuarters,
          noSchoolDays: yearNoSchool,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Save failed (${res.status})`);
      setYearSaveMsg("Saved — applies to every section.");
      // Recompute every row against the new year-level inputs.
      await reloadCalendars();
    } catch (err) {
      setYearSaveMsg(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function loadSections() {
    const res = await fetch("/api/sections");
    if (res.ok) {
      const data = await res.json();
      setSectionsList(data.sections ?? []);
    }
  }

  // Recompute every row's placement from the current server state. Called on
  // mount and after year-level settings change (which move all sections).
  const reloadCalendars = useCallback(async (forCourses?: Course[]) => {
    const list = forCourses ?? coursesRef.current;
    const cals = new Map<string, CourseData>();
    let firstStart = null as string | null;
    await Promise.all(
      list.map(async (c) => {
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
        const noSchoolArr: { date: string; label: string }[] = sched.noSchoolDays ?? [];
        cals.set(c.id, {
          units,
          spans,
          courseMeetingDays: sched.meetingDays ?? "1,2,3,4,5",
          noSchool: new Map(noSchoolArr.map((d) => [d.date, d.label])),
          estimated,
        });
        if (spans[0]?.startDate && (!firstStart || spans[0].startDate < firstStart)) {
          firstStart = spans[0].startDate;
        }
      }),
    );
    setCourseData(cals);
    return firstStart;
  }, []);

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
        coursesRef.current = currentCourses;
        setYears(allYears);
        setSectionsList(sectionsData.sections ?? []);

        const firstStart = await reloadCalendars(currentCourses);
        await loadYearSettings();
        // Land on the earliest scheduled week rather than an empty "today".
        const today = new Date().toISOString().slice(0, 10);
        if (firstStart && today < firstStart) setViewMonday(weekStart(firstStart));
      } catch (err) {
        console.error("Failed to load calendar", err);
      } finally {
        setLoading(false);
      }
    })();
    // Mount-once bootstrap; reloadCalendars is stable and loadYearSettings
    // only touches its own state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Rows: one per section; courses without sections get a course row ───
  const rows = useMemo(() => {
    const out: { key: string; label: string; course: Course; sectionId?: string }[] = [];
    for (const c of courses) {
      const secs = sectionsList.filter((s) => s.courseId === c.id);
      if (secs.length === 0) {
        out.push({ key: c.id, label: `Grade ${c.grade}`, course: c });
      } else {
        for (const s of secs) {
          out.push({
            key: s.id,
            label: `Grade ${c.grade} — ${s.name}`,
            course: c,
            sectionId: s.id,
          });
        }
      }
    }
    return out;
  }, [courses, sectionsList]);

  // Placement per ROW, not per course: two sections of one course can meet on
  // different weekdays, so each row gets its own class-day stream.
  const rowCalendars = useMemo(() => {
    const out = new Map<
      string,
      {
        byDate: Map<string, { p: PlacedLesson<Lesson>; dayIndex: number }[]>;
        meetingDays: Set<number>;
        noSchool: Map<string, string>;
      }
    >();
    for (const row of rows) {
      const data = courseData.get(row.course.id);
      if (!data) continue;
      const section = row.sectionId
        ? sectionsList.find((x) => x.id === row.sectionId)
        : undefined;
      const meetingDays = parseMeetingDays(section?.meetingDays ?? data.courseMeetingDays);
      const noSchoolSet = new Set(data.noSchool.keys());
      const placed = placeLessons(data.units, data.spans, meetingDays, noSchoolSet);
      const byDate = new Map<string, { p: PlacedLesson<Lesson>; dayIndex: number }[]>();
      for (const p of placed) {
        p.dates.forEach((date, i) => {
          const arr = byDate.get(date) ?? [];
          arr.push({ p, dayIndex: i });
          byDate.set(date, arr);
        });
      }
      out.set(row.key, { byDate, meetingDays, noSchool: data.noSchool });
    }
    return out;
  }, [rows, courseData, sectionsList]);

  // Which rows are showing. Everything is checked by default; unchecking a
  // section hides its row (Atlas's course checkboxes).
  const [hiddenRows, setHiddenRows] = useState<Set<string>>(new Set());
  const visibleRows = rows.filter((r) => !hiddenRows.has(r.key));
  const colorFor = (key: string) =>
    SECTION_COLORS[Math.max(0, rows.findIndex((r) => r.key === key)) % SECTION_COLORS.length];

  useEffect(() => {
    setPageContext(
      `The teacher is looking at the all-sections week calendar (week of ${viewMonday}): ${rows.length} row(s) — ${rows.map((r) => r.label).join(", ")}. Sections share their course's plan; per-section pacing drift isn't modeled yet.`,
    );
    return () => setPageContext("");
  }, [rows, viewMonday, setPageContext]);

  const weekDates = [0, 1, 2, 3, 4].map((i) => addDays(viewMonday, i));
  const todayIso = new Date().toISOString().slice(0, 10);
  const anyEstimated = [...courseData.values()].some((c) => c.estimated);

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

  // Per-section edit (#669): meetingDays null goes back to inheriting the
  // course's days, so only the section that differs carries an override.
  async function updateSection(
    id: string,
    patch: { name?: string; period?: string | null; meetingDays?: string | null },
  ) {
    setBusy(true);
    try {
      const res = await fetch("/api/sections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      if (res.ok) await loadSections();
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setYearOpen((v) => !v)}
            className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 rounded-lg px-3 py-1.5 transition-colors"
          >
            {yearOpen ? "Hide school year" : "School year dates"}
          </button>
          <button
            onClick={() => setManageOpen((v) => !v)}
            className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 rounded-lg px-3 py-1.5 transition-colors"
          >
            {manageOpen ? "Hide sections" : "Manage sections"}
          </button>
        </div>
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
        One row per section — uncheck a section to hide it.{" "}
        {anyEstimated && (
          <span className="text-amber-600 dark:text-amber-400 font-medium">
            Quarter dates are an even-split estimate — set the real ones in{" "}
            <button onClick={() => setYearOpen(true)} className="underline">
              School year dates
            </button>
            .
          </span>
        )}
      </p>

      {yearOpen && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 mb-5 space-y-4">
          <div>
            <h2 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              School year {yearForm ? `— ${yearForm.name}` : ""}
            </h2>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              Set once here; applies to every course and section. (Which weekdays a class
              meets is per course — set that on its own calendar.)
            </p>
          </div>

          {!yearForm ? (
            <p className="text-xs text-zinc-500">No school year found.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Year starts
                  <input
                    type="date"
                    value={yearForm.startDate}
                    onChange={(e) => setYearForm((f) => (f ? { ...f, startDate: e.target.value } : f))}
                    className="block mt-0.5 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-1.5 py-1 text-[11px] text-zinc-700 dark:text-zinc-300"
                  />
                </label>
                <label className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Year ends
                  <input
                    type="date"
                    value={yearForm.endDate}
                    onChange={(e) => setYearForm((f) => (f ? { ...f, endDate: e.target.value } : f))}
                    className="block mt-0.5 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-1.5 py-1 text-[11px] text-zinc-700 dark:text-zinc-300"
                  />
                </label>
                <button
                  onClick={() =>
                    yearForm &&
                    setYearQuarters(defaultQuarterSpans(yearForm.startDate, yearForm.endDate))
                  }
                  className="text-[11px] font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 underline"
                >
                  Split into four even quarters
                </button>
              </div>

              <div>
                <h3 className="text-[11px] font-semibold text-zinc-900 dark:text-zinc-100 mb-1.5">
                  Quarter dates
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {yearQuarters.map((q, i) => (
                    <div key={q.name} className="space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        {q.name}
                      </span>
                      <div className="flex items-center gap-1">
                        <input
                          type="date"
                          value={q.startDate}
                          onChange={(e) =>
                            setYearQuarters((prev) =>
                              prev.map((p, j) => (j === i ? { ...p, startDate: e.target.value } : p)),
                            )
                          }
                          className="w-full rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-1.5 py-1 text-[11px] text-zinc-700 dark:text-zinc-300"
                        />
                        <span className="text-zinc-400">–</span>
                        <input
                          type="date"
                          value={q.endDate}
                          onChange={(e) =>
                            setYearQuarters((prev) =>
                              prev.map((p, j) => (j === i ? { ...p, endDate: e.target.value } : p)),
                            )
                          }
                          className="w-full rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-1.5 py-1 text-[11px] text-zinc-700 dark:text-zinc-300"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-[11px] font-semibold text-zinc-900 dark:text-zinc-100 mb-1.5">
                  No-school days{" "}
                  <span className="font-normal text-zinc-400">
                    (holidays, snow days — school-wide, so every section shifts)
                  </span>
                </h3>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="date"
                    value={newNoSchool.date}
                    onChange={(e) => setNewNoSchool((p) => ({ ...p, date: e.target.value }))}
                    className="rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-1.5 py-1 text-[11px] text-zinc-700 dark:text-zinc-300"
                  />
                  <input
                    type="text"
                    value={newNoSchool.label}
                    onChange={(e) => setNewNoSchool((p) => ({ ...p, label: e.target.value }))}
                    placeholder="Label"
                    className="w-32 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-1.5 py-1 text-[11px] text-zinc-700 dark:text-zinc-300"
                  />
                  <button
                    onClick={() => {
                      if (!newNoSchool.date || yearNoSchool.some((d) => d.date === newNoSchool.date))
                        return;
                      setYearNoSchool((prev) =>
                        [...prev, { date: newNoSchool.date, label: newNoSchool.label || "No school" }].sort(
                          (a, b) => a.date.localeCompare(b.date),
                        ),
                      );
                      setNewNoSchool({ date: "", label: "Snow day" });
                    }}
                    className="text-[11px] font-semibold text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 rounded px-2.5 py-1"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {yearNoSchool.map((d) => (
                    <span
                      key={d.date}
                      className="inline-flex items-center gap-1.5 rounded-full bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-2 py-0.5 text-[11px] text-red-700 dark:text-red-300"
                    >
                      {fmt(d.date)} · {d.label}
                      <button
                        onClick={() => setYearNoSchool((prev) => prev.filter((x) => x.date !== d.date))}
                        className="hover:text-red-900 dark:hover:text-red-100"
                        aria-label={`Remove ${d.label}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {yearNoSchool.length === 0 && (
                    <span className="text-[11px] text-zinc-400">none yet</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={saveYearSettings}
                  disabled={busy}
                  className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg px-4 py-1.5 transition-colors"
                >
                  {busy ? "Saving…" : "Save school year"}
                </button>
                {yearSaveMsg && <span className="text-xs text-zinc-500">{yearSaveMsg}</span>}
              </div>
            </>
          )}
        </div>
      )}

      {manageOpen && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 mb-5">
          <h2 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">Sections</h2>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 mb-2">
            Add, remove, and set which weekdays each section meets. A section with no
            override follows its course.
          </p>
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
          <div className="space-y-1.5">
            {sectionsList.map((sec) => {
              const inherited = sec.meetingDays === null;
              const courseDays =
                courseData.get(sec.courseId)?.courseMeetingDays ?? "1,2,3,4,5";
              const effective = parseMeetingDays(sec.meetingDays ?? courseDays);
              return (
                <div
                  key={sec.id}
                  className="flex items-center gap-3 flex-wrap rounded-lg border border-zinc-200 dark:border-zinc-800 px-2.5 py-1.5"
                >
                  <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300 w-40 shrink-0">
                    Grade {sec.grade} — {sec.name}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-zinc-400 mr-1">Meets</span>
                    {[1, 2, 3, 4, 5].map((d) => (
                      <button
                        key={d}
                        onClick={() => {
                          const next = new Set(effective);
                          if (next.has(d)) next.delete(d);
                          else next.add(d);
                          if (next.size === 0) return; // never zero days
                          updateSection(sec.id, {
                            meetingDays: [...next].sort().join(","),
                          });
                        }}
                        disabled={busy}
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                          effective.has(d)
                            ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {DAY_LABELS[d - 1]}
                      </button>
                    ))}
                  </div>
                  {inherited ? (
                    <span className="text-[10px] text-zinc-400">
                      following the course ({courseDays.split(",").length} days)
                    </span>
                  ) : (
                    <button
                      onClick={() => updateSection(sec.id, { meetingDays: null })}
                      disabled={busy}
                      className="text-[10px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 underline"
                    >
                      reset to course days
                    </button>
                  )}
                  <button
                    onClick={() => removeSection(sec.id)}
                    disabled={busy}
                    className="ml-auto text-zinc-400 hover:text-red-500 text-sm leading-none"
                    aria-label={`Delete ${sec.name}`}
                  >
                    ×
                  </button>
                </div>
              );
            })}
            {sectionsList.length === 0 && (
              <span className="text-[11px] text-zinc-400">
                No sections yet — a course without sections shows as one row, using its
                course meeting days.
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
        <div className="flex gap-4 items-start">
          {/* ── My sections: check to show, uncheck to hide ── */}
          <aside className="w-44 shrink-0 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
            <h2 className="text-xs font-semibold text-zinc-900 dark:text-zinc-50">My sections</h2>
            <p className="text-[10px] text-zinc-400 mt-0.5 mb-2">
              {visibleRows.length} of {rows.length} shown
            </p>
            <div className="space-y-1.5">
              {rows.map((row) => {
                const shown = !hiddenRows.has(row.key);
                const color = colorFor(row.key);
                return (
                  <label
                    key={row.key}
                    className="flex items-center gap-2 cursor-pointer group"
                  >
                    <input
                      type="checkbox"
                      checked={shown}
                      onChange={() =>
                        setHiddenRows((prev) => {
                          const next = new Set(prev);
                          if (next.has(row.key)) next.delete(row.key);
                          else next.add(row.key);
                          return next;
                        })
                      }
                      className="h-3.5 w-3.5 rounded border-zinc-300 dark:border-zinc-600 accent-zinc-900 dark:accent-zinc-100"
                    />
                    <span
                      className={`text-[11px] leading-tight flex-1 ${
                        shown
                          ? "text-zinc-700 dark:text-zinc-300"
                          : "text-zinc-400 dark:text-zinc-600"
                      }`}
                    >
                      {row.label}
                    </span>
                    <span
                      className={`h-2.5 w-2.5 rounded-full shrink-0 ${color.dot} ${shown ? "" : "opacity-30"}`}
                    />
                  </label>
                );
              })}
            </div>
          </aside>

          {/* ── The week ── */}
          <div className="flex-1 min-w-0 overflow-x-auto">
            <div className="min-w-[820px]">
              <div
                className="grid gap-2 mb-2"
                style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}
              >
                {weekDates.map((date, i) => (
                  <div
                    key={date}
                    className={`text-center py-1.5 rounded-md min-w-0 ${
                      date === todayIso
                        ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50"
                        : "text-zinc-500 dark:text-zinc-400"
                    }`}
                  >
                    <div className="text-xs font-bold">{DAY_LABELS[i]}</div>
                    <div className="text-[10px] font-normal">{fmt(date)}</div>
                  </div>
                ))}
              </div>

              {visibleRows.length === 0 ? (
                <p className="text-xs text-zinc-400 py-6 text-center">
                  No sections checked — pick one on the left.
                </p>
              ) : (
                <div className="space-y-2">
                  {visibleRows.map((row) => {
                    const cal = rowCalendars.get(row.key);
                    const color = colorFor(row.key);
                    return (
                      <div
                        key={row.key}
                        className="grid gap-2"
                        style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}
                      >
                        {weekDates.map((date) => {
                          const isMeeting = cal?.meetingDays.has(isoWeekday(date)) ?? false;
                          const noSchoolLabel = cal?.noSchool.get(date);
                          const dayLessons = cal?.byDate.get(date) ?? [];

                          // Empty states stay quiet: a thin placeholder keeps
                          // the row aligned without shouting.
                          if (noSchoolLabel || !isMeeting || dayLessons.length === 0) {
                            return (
                              <div
                                key={date}
                                className="rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800 min-h-14 min-w-0 flex items-center justify-center"
                              >
                                <span className="text-[10px] italic text-zinc-300 dark:text-zinc-600 px-1 text-center">
                                  {noSchoolLabel ?? (!isMeeting ? "no class" : "—")}
                                </span>
                              </div>
                            );
                          }

                          return (
                            <div key={date} className="min-w-0 space-y-1.5">
                              {dayLessons.map(({ p, dayIndex }) => (
                                <div
                                  key={`${p.lesson.id}-${dayIndex}`}
                                  className={`rounded-lg border overflow-hidden ${color.ring} ${p.overflow ? "ring-1 ring-red-400" : ""}`}
                                >
                                  {/* Atlas-style header: which class, which unit */}
                                  <div className={`${color.header} px-2 py-1`}>
                                    <div className="text-[10px] font-bold text-white leading-tight truncate">
                                      {row.label}
                                    </div>
                                    <div className="text-[10px] text-white/80 leading-tight truncate">
                                      {p.unitTitle}
                                    </div>
                                  </div>
                                  <div className="px-2 py-1.5 bg-white dark:bg-zinc-900">
                                    <Link
                                      href={`/curriculum/${p.unitId}`}
                                      className="block text-[11px] font-medium text-zinc-900 dark:text-zinc-100 leading-snug hover:underline"
                                    >
                                      {p.lesson.title}
                                      {p.dayCount > 1 && (
                                        <span className="font-normal text-zinc-400">
                                          {" "}
                                          · day {dayIndex + 1}/{p.dayCount}
                                        </span>
                                      )}
                                    </Link>
                                    {(p.lesson.objectives ?? []).slice(0, 2).map((obj, i) => (
                                      <div
                                        key={i}
                                        className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-snug line-clamp-2 mt-0.5"
                                        title={obj}
                                      >
                                        · {obj}
                                      </div>
                                    ))}
                                    {(p.lesson.materials ?? []).length > 0 && (
                                      <div className="mt-1 space-y-px">
                                        {(p.lesson.materials ?? []).map((m, i) =>
                                          m.driveWebUrl ? (
                                            <a
                                              key={i}
                                              href={m.driveWebUrl}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="block text-[10px] text-blue-600 dark:text-blue-400 hover:underline truncate"
                                              title={`${m.title} (${m.role})`}
                                            >
                                              📎 {m.title}
                                            </a>
                                          ) : null,
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <p className="text-[11px] text-zinc-400 mt-4">
        Sections share their course&apos;s plan for now — per-section pacing (a section falling
        behind, its own snow days) comes with actual-vs-planned tracking. School year and
        quarter dates are set above; which weekdays a class meets is on its course calendar.
        {years.length > 0 && ""}
      </p>
    </div>
  );
}
