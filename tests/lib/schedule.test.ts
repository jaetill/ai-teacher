import { describe, it, expect } from "vitest";
import {
  parseDayCount,
  parseMeetingDays,
  isoWeekday,
  classDays,
  placeLessons,
  weekStart,
  defaultQuarterSpans,
} from "../../src/lib/schedule";

// The placement engine is the load-bearing piece of the calendar (#646):
// derived dates, snow-day bumping as pure recomputation. These tests pin it.

const WEEKDAYS = new Set([1, 2, 3, 4, 5]);
const NONE = new Set<string>();

describe("parseDayCount", () => {
  it("reads Heidi's title convention", () => {
    expect(parseDayCount("The Giver: Ch. 13–23 (6 days)")).toBe(6);
    expect(parseDayCount("Intro (1 day)")).toBe(1);
    expect(parseDayCount("Poetry (2 Days)")).toBe(2);
  });
  it("returns null when absent or absurd", () => {
    expect(parseDayCount("The Westing Game: Vocabulary")).toBeNull();
    expect(parseDayCount("Marathon (99 days)")).toBeNull();
    expect(parseDayCount("Notes (0 days)")).toBeNull();
  });
});

describe("parseMeetingDays", () => {
  it("parses a CSV of ISO weekdays", () => {
    expect([...parseMeetingDays("1,3,5")]).toEqual([1, 3, 5]);
  });
  it("falls back to Mon–Fri on empty/garbage", () => {
    expect([...parseMeetingDays(null)]).toEqual([1, 2, 3, 4, 5]);
    expect([...parseMeetingDays("banana")]).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("classDays", () => {
  // 2026-08-31 is a Monday.
  it("yields only meeting days", () => {
    const days = classDays("2026-08-31", "2026-09-06", WEEKDAYS, NONE);
    expect(days).toEqual(["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"]);
    expect(days.every((d) => isoWeekday(d) <= 5)).toBe(true);
  });

  it("skips no-school days", () => {
    const days = classDays("2026-08-31", "2026-09-04", WEEKDAYS, new Set(["2026-09-02"]));
    expect(days).toEqual(["2026-08-31", "2026-09-01", "2026-09-03", "2026-09-04"]);
  });

  it("respects a reduced meeting pattern", () => {
    const days = classDays("2026-08-31", "2026-09-06", new Set([2, 4]), NONE);
    expect(days).toEqual(["2026-09-01", "2026-09-03"]); // Tue, Thu
  });
});

const UNIT = (quarter: string, lessons: { id: string; title: string; sortOrder: number }[]) => ({
  id: "u1",
  title: "The Giver",
  quarter,
  sortOrder: 1,
  lessons,
});
const Q1 = { name: "Q1", startDate: "2026-08-31", endDate: "2026-10-30" };

describe("placeLessons", () => {
  it("places sequential lessons on consecutive class days, honoring day counts", () => {
    const placed = placeLessons(
      [
        UNIT("Q1", [
          { id: "l1", title: "Intro (2 days)", sortOrder: 1 },
          { id: "l2", title: "Ch. 1–5", sortOrder: 2 },
        ]),
      ],
      [Q1],
      WEEKDAYS,
      NONE,
    );
    expect(placed[0].dates).toEqual(["2026-08-31", "2026-09-01"]); // Mon, Tue
    expect(placed[1].dates).toEqual(["2026-09-02"]); // Wed — default 1 day
    expect(placed.every((p) => !p.overflow)).toBe(true);
  });

  it("SNOW DAY: adding a no-school day bumps everything downstream", () => {
    const units = [
      UNIT("Q1", [
        { id: "l1", title: "Intro", sortOrder: 1 },
        { id: "l2", title: "Ch. 1–5", sortOrder: 2 },
      ]),
    ];
    const before = placeLessons(units, [Q1], WEEKDAYS, NONE);
    expect(before[1].dates).toEqual(["2026-09-01"]);

    const after = placeLessons(units, [Q1], WEEKDAYS, new Set(["2026-09-01"]));
    expect(after[0].dates).toEqual(["2026-08-31"]); // untouched — before the snow day
    expect(after[1].dates).toEqual(["2026-09-02"]); // bumped past it
  });

  it("flags overflow when lessons need more days than the quarter has", () => {
    const tinyQuarter = { name: "Q1", startDate: "2026-08-31", endDate: "2026-09-01" };
    const placed = placeLessons(
      [
        UNIT("Q1", [
          { id: "l1", title: "Intro (2 days)", sortOrder: 1 },
          { id: "l2", title: "Overflowing", sortOrder: 2 },
        ]),
      ],
      [tinyQuarter],
      WEEKDAYS,
      NONE,
    );
    expect(placed[0].overflow).toBe(false);
    expect(placed[1].overflow).toBe(true);
    expect(placed[1].dates).toHaveLength(1); // still gets a real date, past the end
    expect(placed[1].dates[0] > tinyQuarter.endDate).toBe(true);
  });

  it("keeps quarters independent — Q2 starts at its own start date", () => {
    const placed = placeLessons(
      [
        UNIT("Q1", [{ id: "l1", title: "A", sortOrder: 1 }]),
        { ...UNIT("Q2", [{ id: "l2", title: "B", sortOrder: 1 }]), id: "u2" },
      ],
      [Q1, { name: "Q2", startDate: "2026-11-02", endDate: "2027-01-22" }],
      WEEKDAYS,
      NONE,
    );
    expect(placed.find((p) => p.lesson.id === "l2")!.dates).toEqual(["2026-11-02"]);
  });
});

describe("weekStart / defaultQuarterSpans", () => {
  it("weekStart returns the Monday of the week", () => {
    expect(weekStart("2026-09-03")).toBe("2026-08-31"); // Thu → Mon
    expect(weekStart("2026-08-31")).toBe("2026-08-31"); // Mon → itself
    expect(weekStart("2026-09-06")).toBe("2026-08-31"); // Sun → prior Mon
  });

  it("defaultQuarterSpans covers the whole year with 4 contiguous spans", () => {
    const spans = defaultQuarterSpans("2026-08-15", "2027-06-15");
    expect(spans).toHaveLength(4);
    expect(spans[0].startDate).toBe("2026-08-15");
    expect(spans[3].endDate).toBe("2027-06-15");
    for (let i = 1; i < 4; i++) {
      // contiguous: each quarter starts the day after the previous ends
      expect(spans[i].startDate > spans[i - 1].endDate).toBe(true);
    }
  });
});
