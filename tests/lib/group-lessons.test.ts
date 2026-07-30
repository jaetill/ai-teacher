import { describe, it, expect } from "vitest";
import { groupLessonsByWeek } from "../../src/lib/group-lessons";

const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i }));

function sizes<T>(weeks: { week: number; lessons: T[] }[]) {
  return weeks.map((w) => w.lessons.length);
}

describe("groupLessonsByWeek", () => {
  it("renders every stated week: 11 lessons over 8 weeks (the #627 case)", () => {
    const weeks = groupLessonsByWeek(mk(11), 8);
    expect(weeks).toHaveLength(8); // was 6 with the old ceil-and-drop logic
    expect(sizes(weeks)).toEqual([2, 2, 2, 1, 1, 1, 1, 1]);
  });

  it("balances sizes to differ by at most one", () => {
    const weeks = groupLessonsByWeek(mk(20), 7);
    expect(sizes(weeks)).toEqual([3, 3, 3, 3, 3, 3, 2]);
  });

  it("splits evenly when divisible", () => {
    expect(sizes(groupLessonsByWeek(mk(12), 4))).toEqual([3, 3, 3, 3]);
  });

  it("shows trailing weeks as empty when there are fewer lessons than weeks", () => {
    const weeks = groupLessonsByWeek(mk(3), 6);
    expect(weeks).toHaveLength(6);
    expect(sizes(weeks)).toEqual([1, 1, 1, 0, 0, 0]);
  });

  it("preserves lesson order across weeks", () => {
    const weeks = groupLessonsByWeek(mk(5), 2);
    const flat = weeks.flatMap((w) => w.lessons).map((l) => (l as { id: number }).id);
    expect(flat).toEqual([0, 1, 2, 3, 4]);
    expect(weeks.map((w) => w.week)).toEqual([1, 2]);
  });

  it("falls back to one group when duration is zero or negative", () => {
    expect(sizes(groupLessonsByWeek(mk(4), 0))).toEqual([4]);
    expect(sizes(groupLessonsByWeek(mk(4), -1))).toEqual([4]);
  });

  it("returns no week rows for an empty unit, regardless of duration", () => {
    expect(groupLessonsByWeek([], 0)).toEqual([]);
    expect(groupLessonsByWeek([], 3)).toEqual([]);
  });
});
