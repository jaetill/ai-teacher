// Calendar placement engine (#646 first slice) — pure functions, no I/O.
//
// The design decision that matters: lesson dates are DERIVED, never stored.
// The calendar is two streams laid against each other — the ordered lessons
// (each consuming N class days) and the ordered available school days
// (quarter spans × meeting days − no-school days). A snow day just removes
// one day from the stream and everything downstream shifts automatically;
// there is no per-lesson reschedule state to maintain or corrupt. (The
// scaffold-era lesson_schedules table stores per-lesson dates — deliberately
// unused; see the keep/reshape/drop note on #646.)
//
// Day counts: many of Heidi's lesson titles already encode real day counts —
// "The Giver: Ch. 13–23 (6 days)" — so parseDayCount captures those (#627's
// idea arriving for free) and everything else defaults to 1 day.
//
// All dates are ISO strings (YYYY-MM-DD) and all arithmetic is UTC-based so
// the same input gives the same calendar in any timezone.

export type QuarterSpan = {
  name: string; // "Summer" | "Q1".."Q4"
  startDate: string; // YYYY-MM-DD inclusive
  endDate: string; // YYYY-MM-DD inclusive
};

export type ScheduleUnit<L extends { id: string; title: string; sortOrder: number }> = {
  id: string;
  title: string;
  quarter: string | null;
  sortOrder: number;
  lessons: L[];
};

export type PlacedLesson<L> = {
  lesson: L;
  unitId: string;
  unitTitle: string;
  quarter: string;
  dates: string[]; // the class days this lesson occupies, in order
  dayCount: number;
  overflow: boolean; // ran past the quarter's stated end date
};

/** "The Giver: Ch. 13–23 (6 days)" → 6; "(1 day)" → 1; otherwise null. */
export function parseDayCount(title: string): number | null {
  const m = /\((\d{1,2})\s*days?\)/i.exec(title);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 1 && n <= 30 ? n : null;
}

function toUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** ISO weekday, 1 = Monday … 7 = Sunday. */
export function isoWeekday(iso: string): number {
  const wd = toUtc(iso).getUTCDay(); // 0 = Sunday
  return wd === 0 ? 7 : wd;
}

export function addDays(iso: string, n: number): string {
  const d = toUtc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}

/**
 * Ordered class days for a span: every date in [start..end] that falls on a
 * meeting day and is not a no-school day. `extendDays` lets a caller keep
 * generating past the end (overflow placement stays visible instead of
 * silently truncating the tail of the quarter).
 */
export function classDays(
  startDate: string,
  endDate: string,
  meetingDays: ReadonlySet<number>,
  noSchool: ReadonlySet<string>,
  extendDays = 0,
): string[] {
  if (!startDate || !endDate || startDate > endDate) return [];
  const out: string[] = [];
  const hardEnd = addDays(endDate, extendDays);
  for (let d = startDate; d <= hardEnd; d = addDays(d, 1)) {
    if (meetingDays.has(isoWeekday(d)) && !noSchool.has(d)) out.push(d);
  }
  return out;
}

/** Parse "1,2,3,4,5" → Set{1..5}; invalid/empty falls back to Mon–Fri. */
export function parseMeetingDays(value: string | null | undefined): Set<number> {
  const days = (value ?? "")
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => n >= 1 && n <= 7);
  return days.length > 0 ? new Set(days) : new Set([1, 2, 3, 4, 5]);
}

/**
 * Deal every unit's lessons onto real dates, quarter by quarter. Units are
 * taken in sortOrder within their quarter; each lesson consumes its parsed
 * day count (default 1). If a quarter's lessons need more class days than the
 * quarter has, placement continues past the end date with overflow: true —
 * the calendar shows the truth and the teacher adjusts dates or content.
 */
export function placeLessons<L extends { id: string; title: string; sortOrder: number }>(
  units: ScheduleUnit<L>[],
  quarters: QuarterSpan[],
  meetingDays: ReadonlySet<number>,
  noSchool: ReadonlySet<string>,
): PlacedLesson<L>[] {
  const placed: PlacedLesson<L>[] = [];
  for (const q of quarters) {
    const quarterUnits = units
      .filter((u) => u.quarter === q.name)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const totalDaysNeeded = quarterUnits
      .flatMap((u) => u.lessons)
      .reduce((sum, l) => sum + (parseDayCount(l.title) ?? 1), 0);
    if (totalDaysNeeded === 0) continue;

    // Generate generously past the end so overflow lessons still get dates.
    const days = classDays(q.startDate, q.endDate, meetingDays, noSchool, totalDaysNeeded * 7);
    let cursor = 0;
    for (const u of quarterUnits) {
      const lessons = [...u.lessons].sort((a, b) => a.sortOrder - b.sortOrder);
      for (const lesson of lessons) {
        const n = parseDayCount(lesson.title) ?? 1;
        const dates = days.slice(cursor, cursor + n);
        cursor += n;
        placed.push({
          lesson,
          unitId: u.id,
          unitTitle: u.title,
          quarter: q.name,
          dates,
          dayCount: n,
          overflow: dates.length === 0 || dates[dates.length - 1] > q.endDate,
        });
      }
    }
  }
  return placed;
}

/** Monday of the week containing `iso`. */
export function weekStart(iso: string): string {
  return addDays(iso, -(isoWeekday(iso) - 1));
}

/** Even placeholder split of a school year into Q1–Q4 (until real dates are saved). */
export function defaultQuarterSpans(yearStart: string, yearEnd: string): QuarterSpan[] {
  const totalDays =
    Math.round((toUtc(yearEnd).getTime() - toUtc(yearStart).getTime()) / 86_400_000) + 1;
  if (totalDays < 4) return [];
  const per = Math.floor(totalDays / 4);
  const spans: QuarterSpan[] = [];
  for (let i = 0; i < 4; i++) {
    const start = addDays(yearStart, i * per);
    const end = i === 3 ? yearEnd : addDays(yearStart, (i + 1) * per - 1);
    spans.push({ name: `Q${i + 1}`, startDate: start, endDate: end });
  }
  return spans;
}
