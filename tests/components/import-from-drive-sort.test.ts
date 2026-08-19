import { describe, it, expect } from "vitest";
import { sortRootFilesFirst } from "@/components/ImportFromDrive";

// Regression test for the shape of Heidi's real Grade 6 folder:
// one document at the root ("Grade 6 Texts/Plan Overview 26-27") alongside
// eight unit folders, the first of which ("Dash Q3") holds ~23 files. A
// depth-first recursive scan returns the root document about 25 entries in,
// which put it out of sight in a ~10-row scroll box — the file the Year Plan
// feature exists to import was the hardest one in the list to find.

type Row = { sourceUnit: string | null; name: string };

describe("sortRootFilesFirst", () => {
  it("lifts the root-level file above a large preceding unit folder", () => {
    const scanned: Row[] = [
      // "Dash Q3" is listed first by Drive and recursed fully before the
      // root-level document is reached.
      ...Array.from({ length: 23 }, (_, i) => ({
        sourceUnit: "Dash Q3",
        name: `Dash file ${String(i).padStart(2, "0")}`,
      })),
      { sourceUnit: null, name: "Grade 6 Texts/Plan Overview 26-27" },
      { sourceUnit: "Tiger, Tiger Q1", name: "Tiger reading guide" },
    ];

    const sorted = sortRootFilesFirst(scanned);

    expect(sorted[0].name).toBe("Grade 6 Texts/Plan Overview 26-27");
    expect(sorted[0].sourceUnit).toBeNull();
  });

  it("keeps every file — it reorders, it does not filter", () => {
    const scanned: Row[] = [
      { sourceUnit: "Unit B", name: "b1" },
      { sourceUnit: null, name: "plan" },
      { sourceUnit: "Unit A", name: "a1" },
    ];

    expect(sortRootFilesFirst(scanned)).toHaveLength(3);
  });

  it("groups the remainder by unit, then by name", () => {
    const scanned: Row[] = [
      { sourceUnit: "Unit B", name: "b2" },
      { sourceUnit: "Unit A", name: "a2" },
      { sourceUnit: "Unit B", name: "b1" },
      { sourceUnit: "Unit A", name: "a1" },
    ];

    expect(sortRootFilesFirst(scanned).map((f) => f.name)).toEqual(["a1", "a2", "b1", "b2"]);
  });

  it("orders multiple root files among themselves by name", () => {
    const scanned: Row[] = [
      { sourceUnit: "Unit A", name: "a1" },
      { sourceUnit: null, name: "zebra plan" },
      { sourceUnit: null, name: "alpha plan" },
    ];

    expect(sortRootFilesFirst(scanned).map((f) => f.name)).toEqual([
      "alpha plan",
      "zebra plan",
      "a1",
    ]);
  });

  it("does not mutate the array it was given", () => {
    const scanned: Row[] = [
      { sourceUnit: "Unit A", name: "a1" },
      { sourceUnit: null, name: "plan" },
    ];
    const snapshot = [...scanned];

    sortRootFilesFirst(scanned);

    expect(scanned).toEqual(snapshot);
  });

  it("handles a folder with no root-level files at all", () => {
    const scanned: Row[] = [
      { sourceUnit: "Unit A", name: "a1" },
      { sourceUnit: "Unit B", name: "b1" },
    ];

    expect(sortRootFilesFirst(scanned).map((f) => f.name)).toEqual(["a1", "b1"]);
  });
});
