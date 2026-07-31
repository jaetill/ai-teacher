"use client";

// Lesson calendar (#646 first slice) — a literal week calendar, Atlas-style:
// lessons sit on real dates, and removing a day (snow day, assembly) bumps
// everything downstream automatically because placement is DERIVED, not
// stored (src/lib/schedule.ts). The teacher edits three inputs — quarter
// dates, meeting days, no-school days — and the calendar recomputes live.

import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
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

const QUARTER_BADGES: Record<string, string> = {
  Summer: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  Q1: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  Q2: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  Q3: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  Q4: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};
const QUARTER_BARS: Record<string, string> = {
  Summer: "bg-orange-400 dark:bg-orange-500",
  Q1: "bg-blue-400 dark:bg-blue-500",
  Q2: "bg-violet-400 dark:bg-violet-500",
  Q3: "bg-teal-400 dark:bg-teal-500",
  Q4: "bg-amber-400 dark:bg-amber-500",
};
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

type Lesson = {
  id: string;
  title: string;
  sortOrder: number;
  materialCount: number;
};
type Unit = {
  id: string;
  title: string;
  quarter: string | null;
  sortOrder: number;
  durationWeeks: number;
  lessons: Lesson[];
};
type NoSchoolDay = { date: string; label: string };

function fmt(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function CalendarPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const { setPageContext } = useCopilot();
  const [course, setCourse] = useState<{ id: string; title: string; grade: number } | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Schedule inputs (server-backed, edited live) ───
  const [schoolYear, setSchoolYear] = useState<{ name: string; startDate: string; endDate: string } | null>(null);
  const [quarterSpans, setQuarterSpans] = useState<QuarterSpan[]>([]);
  const [usingDefaults, setUsingDefaults] = useState(false);
  const [noSchoolDays, setNoSchoolDays] = useState<NoSchoolDay[]>([]);
  const [meetingDaysCsv, setMeetingDaysCsv] = useState("1,2,3,4,5");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [newNoSchool, setNewNoSchool] = useState({ date: "", label: "Snow day" });

  // ── Viewport ───
  const [viewMonday, setViewMonday] = useState<string>(() => weekStart(new Date().toISOString().slice(0, 10)));

  useEffect(() => {
    (async () => {
      try {
        const [dataRes, schedRes] = await Promise.all([
          fetch(`/api/curriculum/editor/data?courseId=${courseId}`),
          fetch(`/api/schedule/${courseId}`),
        ]);
        if (!dataRes.ok || !schedRes.ok) throw new Error("Failed to load");
        const data = await dataRes.json();
        const sched = await schedRes.json();
        setCourse(data.course ?? null);
        setUnits(data.units ?? []);
        setMeetingDaysCsv(sched.meetingDays ?? "1,2,3,4,5");
        setSchoolYear(sched.schoolYear ?? null);
        setNoSchoolDays(sched.noSchoolDays ?? []);
        if ((sched.quarterSpans ?? []).length > 0) {
          setQuarterSpans(sched.quarterSpans);
        } else if (sched.schoolYear) {
          // No saved dates yet: prefill an even split so the calendar renders
          // immediately; saving makes it real.
          setQuarterSpans(defaultQuarterSpans(sched.schoolYear.startDate, sched.schoolYear.endDate));
          setUsingDefaults(true);
          setSettingsOpen(true);
        }
        // Land the viewport on the first placed week rather than a possibly
        // empty "today" week.
        if (sched.quarterSpans?.[0]?.startDate) {
          setViewMonday(weekStart(sched.quarterSpans[0].startDate));
        } else if (sched.schoolYear?.startDate) {
          setViewMonday(weekStart(sched.schoolYear.startDate));
        }
      } catch (err) {
        console.error(err);
        setError("Could not load the calendar.");
      } finally {
        setLoading(false);
      }
    })();
  }, [courseId]);

  const meetingDays = useMemo(() => parseMeetingDays(meetingDaysCsv), [meetingDaysCsv]);
  const noSchoolSet = useMemo(() => new Set(noSchoolDays.map((d) => d.date)), [noSchoolDays]);
  const noSchoolByDate = useMemo(
    () => new Map(noSchoolDays.map((d) => [d.date, d.label])),
    [noSchoolDays],
  );

  // ── The whole calendar: one pure computation ───
  const placed = useMemo(
    () => placeLessons(units, quarterSpans, meetingDays, noSchoolSet),
    [units, quarterSpans, meetingDays, noSchoolSet],
  );
  const byDate = useMemo(() => {
    const m = new Map<string, { p: PlacedLesson<Lesson>; dayIndex: number }[]>();
    for (const p of placed) {
      p.dates.forEach((date, i) => {
        const arr = m.get(date) ?? [];
        arr.push({ p, dayIndex: i });
        m.set(date, arr);
      });
    }
    return m;
  }, [placed]);
  const overflowCount = placed.filter((p) => p.overflow).length;

  useEffect(() => {
    if (!course) return;
    setPageContext(
      `The teacher is looking at the lesson calendar for Grade ${course.grade}: lessons placed on real dates (week of ${viewMonday}). Quarter dates${usingDefaults ? " are ESTIMATED (even split, not saved yet)" : ""}, meeting days ${meetingDaysCsv}, ${noSchoolDays.length} no-school day(s). ${overflowCount > 0 ? `${overflowCount} lesson(s) overflow their quarter.` : ""}`,
    );
    return () => setPageContext("");
  }, [course, viewMonday, usingDefaults, meetingDaysCsv, noSchoolDays.length, overflowCount, setPageContext]);

  const save = useCallback(async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`/api/schedule/${courseId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingDays: meetingDaysCsv, quarterSpans, noSchoolDays }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Save failed (${res.status})`);
      }
      setUsingDefaults(false);
      setSaveMsg("Saved.");
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [courseId, meetingDaysCsv, quarterSpans, noSchoolDays]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-10">
        <span className="text-sm text-zinc-400 animate-pulse">Loading calendar…</span>
      </div>
    );
  }
  if (error || !course) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-10">
        <p className="text-sm text-zinc-500">{error ?? "Course not found."}</p>
      </div>
    );
  }
  if (!schoolYear) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-10">
        <p className="text-sm text-zinc-500">
          This course has no school year assigned, so it can&apos;t be placed on a calendar
          yet. Assign a school year from the <Link href="/curriculum" className="underline">year view</Link> first.
        </p>
      </div>
    );
  }

  const weekDates = [0, 1, 2, 3, 4].map((i) => addDays(viewMonday, i));
  const todayIso = new Date().toISOString().slice(0, 10);

  const toggleMeetingDay = (day: number) => {
    const next = new Set(meetingDays);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    if (next.size === 0) return; // never zero meeting days
    setMeetingDaysCsv([...next].sort().join(","));
  };

  const markNoSchool = (date: string, label: string) => {
    if (noSchoolSet.has(date)) return;
    setNoSchoolDays((prev) => [...prev, { date, label }].sort((a, b) => a.date.localeCompare(b.date)));
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
          Grade {course.grade} — lesson calendar
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 rounded-lg px-3 py-1.5 transition-colors"
          >
            {settingsOpen ? "Hide settings" : "Calendar settings"}
          </button>
          <Link
            href="/curriculum"
            className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
          >
            ← Year view
          </Link>
        </div>
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
        {schoolYear.name} · lessons are placed onto class days automatically — mark a snow
        day and everything after it shifts.
        {usingDefaults && (
          <span className="text-amber-600 dark:text-amber-400 font-medium">
            {" "}Quarter dates are an even-split estimate — adjust and save them below.
          </span>
        )}
        {overflowCount > 0 && (
          <span className="text-red-600 dark:text-red-400 font-medium">
            {" "}{overflowCount} lesson{overflowCount === 1 ? "" : "s"} overflow their quarter&apos;s end date.
          </span>
        )}
      </p>

      {/* ── Settings ── */}
      {settingsOpen && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 mb-5 space-y-4">
          <div>
            <h2 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Quarter dates</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {quarterSpans.map((q, i) => (
                <div key={q.name} className="text-xs space-y-1">
                  <span className={`inline-block text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${QUARTER_BADGES[q.name] ?? ""}`}>
                    {q.name}
                  </span>
                  <div className="flex items-center gap-1">
                    <input
                      type="date"
                      value={q.startDate}
                      onChange={(e) =>
                        setQuarterSpans((prev) => prev.map((p, j) => (j === i ? { ...p, startDate: e.target.value } : p)))
                      }
                      className="w-full rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-1.5 py-1 text-[11px] text-zinc-700 dark:text-zinc-300"
                    />
                    <span className="text-zinc-400">–</span>
                    <input
                      type="date"
                      value={q.endDate}
                      onChange={(e) =>
                        setQuarterSpans((prev) => prev.map((p, j) => (j === i ? { ...p, endDate: e.target.value } : p)))
                      }
                      className="w-full rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-1.5 py-1 text-[11px] text-zinc-700 dark:text-zinc-300"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-6">
            <div>
              <h2 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Class meets on</h2>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((d) => (
                  <button
                    key={d}
                    onClick={() => toggleMeetingDay(d)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      meetingDays.has(d)
                        ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {DAY_LABELS[d - 1]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 min-w-64">
              <h2 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                No-school days <span className="font-normal text-zinc-400">(holidays, snow days, assemblies)</span>
              </h2>
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
                    if (newNoSchool.date) {
                      markNoSchool(newNoSchool.date, newNoSchool.label || "No school");
                      setNewNoSchool({ date: "", label: "Snow day" });
                    }
                  }}
                  className="text-[11px] font-semibold text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 rounded px-2.5 py-1"
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {noSchoolDays.map((d) => (
                  <span
                    key={d.date}
                    className="inline-flex items-center gap-1.5 rounded-full bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-2 py-0.5 text-[11px] text-red-700 dark:text-red-300"
                  >
                    {fmt(d.date)} · {d.label}
                    <button
                      onClick={() => setNoSchoolDays((prev) => prev.filter((x) => x.date !== d.date))}
                      className="hover:text-red-900 dark:hover:text-red-100"
                      aria-label={`Remove ${d.label}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {noSchoolDays.length === 0 && (
                  <span className="text-[11px] text-zinc-400">none yet</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg px-4 py-1.5 transition-colors"
            >
              {saving ? "Saving…" : "Save calendar settings"}
            </button>
            {saveMsg && <span className="text-xs text-zinc-500">{saveMsg}</span>}
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
          className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 rounded-lg px-2.5 py-1.5"
          aria-label="Previous week"
        >
          ←
        </button>
        <button
          onClick={() => setViewMonday((m) => addDays(m, 7))}
          className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 rounded-lg px-2.5 py-1.5"
          aria-label="Next week"
        >
          →
        </button>
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {fmt(weekDates[0])} – {fmt(weekDates[4])}
        </span>
      </div>

      {/* ── The week grid ── */}
      <div className="grid grid-cols-5 gap-2">
        {weekDates.map((date, i) => {
          const isMeeting = meetingDays.has(isoWeekday(date));
          const noSchoolLabel = noSchoolByDate.get(date);
          const dayLessons = byDate.get(date) ?? [];
          const isToday = date === todayIso;
          return (
            <div
              key={date}
              className={`rounded-xl border min-h-48 flex flex-col ${
                isToday
                  ? "border-zinc-400 dark:border-zinc-500"
                  : "border-zinc-200 dark:border-zinc-800"
              } ${!isMeeting || noSchoolLabel ? "bg-zinc-50/50 dark:bg-zinc-900/40" : "bg-white dark:bg-zinc-900"}`}
            >
              <div className="px-2.5 pt-2 pb-1.5 border-b border-zinc-100 dark:border-zinc-800 flex items-baseline justify-between">
                <span className={`text-xs font-bold ${isToday ? "text-zinc-900 dark:text-zinc-50" : "text-zinc-500 dark:text-zinc-400"}`}>
                  {DAY_LABELS[i]} <span className="font-normal">{fmt(date)}</span>
                </span>
                {isMeeting && !noSchoolLabel && (
                  <button
                    onClick={() => markNoSchool(date, "Snow day")}
                    title="Mark as no school (snow day) — lessons after this shift forward"
                    className="text-[10px] text-zinc-300 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                  >
                    ❄
                  </button>
                )}
              </div>
              <div className="p-2 space-y-1.5 flex-1">
                {noSchoolLabel ? (
                  <div className="text-[11px] font-medium text-red-600 dark:text-red-400">
                    {noSchoolLabel}
                    <button
                      onClick={() => setNoSchoolDays((prev) => prev.filter((x) => x.date !== date))}
                      className="ml-1.5 text-[10px] text-zinc-400 hover:text-zinc-600 underline"
                    >
                      undo
                    </button>
                  </div>
                ) : !isMeeting ? (
                  <div className="text-[11px] italic text-zinc-300 dark:text-zinc-600">no class</div>
                ) : dayLessons.length === 0 ? (
                  <div className="text-[11px] italic text-zinc-300 dark:text-zinc-600">—</div>
                ) : (
                  dayLessons.map(({ p, dayIndex }) => (
                    <Link
                      key={`${p.lesson.id}-${dayIndex}`}
                      href={`/curriculum/${p.unitId}`}
                      className={`block rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden hover:border-zinc-400 dark:hover:border-zinc-500 transition-colors ${p.overflow ? "ring-1 ring-red-300 dark:ring-red-800" : ""}`}
                    >
                      <div className={`h-1 ${QUARTER_BARS[p.quarter] ?? "bg-zinc-300"}`} />
                      <div className="px-2 py-1.5">
                        <div className="text-[10px] font-medium text-zinc-400 truncate">{p.unitTitle}</div>
                        <div className="text-[11px] text-zinc-800 dark:text-zinc-200 leading-snug">
                          {p.lesson.title}
                        </div>
                        <div className="text-[10px] text-zinc-400 mt-0.5">
                          {p.dayCount > 1 && `day ${dayIndex + 1} of ${p.dayCount}`}
                          {p.dayCount > 1 && p.lesson.materialCount > 0 && " · "}
                          {p.lesson.materialCount > 0 && `${p.lesson.materialCount} 📎`}
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-zinc-400 mt-4">
        Day counts come from lesson titles like &quot;(6 days)&quot; — everything else takes one
        class day. Changes here recompute instantly; use Save to keep them.
      </p>
    </div>
  );
}
