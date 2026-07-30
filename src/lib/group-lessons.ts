// Group a unit's lessons into display weeks across the unit's stated duration.
//
// History: the original grouping used ceil(lessons / weeks) per week and
// dropped empty trailing weeks — an 8-week unit with 11 lessons rendered as
// "Week 1–6", contradicting the "8 weeks" header on the same page (#627).
// This version deals lessons out evenly (week sizes differ by at most one)
// and always renders every week of the stated duration, so the grouping and
// the duration header can't disagree. Weeks with no lessons show as
// unscheduled — honest, since the duration is the teacher's claim about the
// unit, not something derived from lesson data.
//
// Known limit (see issue #628): lessons carry no per-day duration in the
// schema (only durationMinutes), so this grouping is synthetic pacing, not
// captured reality. Some of the teacher's own lesson titles encode real day
// counts ("Ch. 13–23 (6 days)"); capturing those would allow true
// day-accurate week allocation.

export function groupLessonsByWeek<T>(
  lessons: T[],
  durationWeeks: number
): { week: number; lessons: T[] }[] {
  if (lessons.length === 0) return []; // empty unit: no synthetic week rows

  if (durationWeeks <= 0) {
    // No stated duration: fall back to a single group holding everything,
    // rather than rendering nothing for a unit that clearly has lessons.
    return lessons.length > 0 ? [{ week: 1, lessons: [...lessons] }] : [];
  }

  const base = Math.floor(lessons.length / durationWeeks);
  const extra = lessons.length % durationWeeks; // first `extra` weeks get one more

  const weeks: { week: number; lessons: T[] }[] = [];
  let cursor = 0;
  for (let w = 0; w < durationWeeks; w++) {
    const size = base + (w < extra ? 1 : 0);
    weeks.push({ week: w + 1, lessons: lessons.slice(cursor, cursor + size) });
    cursor += size;
  }
  return weeks;
}
