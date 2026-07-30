import { describe, it, expect } from "vitest";
import { placeUnitInQuarter, quarterRank } from "../../src/lib/unit-order";

type U = { id: string; quarter: string | null; sortOrder: number };

const mk = (specs: [string, string | null][]): U[] =>
  specs.map(([id, quarter], i) => ({ id, quarter, sortOrder: i + 1 }));

const order = (units: U[]) => units.map((u) => u.id);

describe("quarterRank", () => {
  it("orders Summer before Q1-Q4, quarterless last", () => {
    expect(quarterRank("Summer")).toBeLessThan(quarterRank("Q1"));
    expect(quarterRank("Q1")).toBeLessThan(quarterRank("Q4"));
    expect(quarterRank("Q4")).toBeLessThan(quarterRank(null));
    expect(quarterRank("garbage")).toBe(quarterRank(null));
  });
});

describe("placeUnitInQuarter", () => {
  const YEAR = mk([
    ["giver", "Q1"],
    ["westing", "Q2"],
    ["outsiders", "Q3"],
    ["rott", "Q4"],
    ["new", null], // freshly created unit, appended at the bottom
  ]);

  it("moves a new bottom unit into its assigned quarter's slot (the reported bug)", () => {
    const next = placeUnitInQuarter(YEAR, "new", "Q2");
    expect(order(next)).toEqual(["giver", "westing", "new", "outsiders", "rott"]);
    expect(next.map((u) => u.sortOrder)).toEqual([1, 2, 3, 4, 5]);
    expect(next[2].quarter).toBe("Q2");
  });

  it("places at the END of an existing quarter group", () => {
    const units = mk([
      ["a", "Q1"],
      ["b", "Q1"],
      ["c", "Q2"],
      ["new", null],
    ]);
    expect(order(placeUnitInQuarter(units, "new", "Q1"))).toEqual(["a", "b", "new", "c"]);
  });

  it("places into an empty quarter between neighbors", () => {
    const units = mk([
      ["a", "Q1"],
      ["c", "Q3"],
      ["new", null],
    ]);
    expect(order(placeUnitInQuarter(units, "new", "Q2"))).toEqual(["a", "new", "c"]);
  });

  it("moves Summer to the front", () => {
    const next = placeUnitInQuarter(YEAR, "new", "Summer");
    expect(order(next)[0]).toBe("new");
  });

  it("clearing the quarter sinks the unit to the end", () => {
    const units = mk([
      ["a", "Q1"],
      ["b", "Q2"],
    ]);
    const next = placeUnitInQuarter(units, "a", null);
    expect(order(next)).toEqual(["b", "a"]);
    expect(next[1].quarter).toBeNull();
  });

  it("re-assigning within the same quarter keeps it in that group", () => {
    const units = mk([
      ["a", "Q1"],
      ["b", "Q1"],
      ["c", "Q2"],
    ]);
    expect(order(placeUnitInQuarter(units, "a", "Q1"))).toEqual(["b", "a", "c"]);
  });

  it("returns the same reference for an unknown unit", () => {
    expect(placeUnitInQuarter(YEAR, "nope", "Q1")).toBe(YEAR);
  });

  it("preserves relative order of untouched units", () => {
    const next = placeUnitInQuarter(YEAR, "new", "Q4");
    expect(order(next)).toEqual(["giver", "westing", "outsiders", "rott", "new"]);
  });
});
