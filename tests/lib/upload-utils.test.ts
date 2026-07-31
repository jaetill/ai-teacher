import { describe, it, expect } from "vitest";
import { isValidFolderTarget } from "../../src/lib/upload-utils";

// #593: destination/category shape folder keys — this gate is what keeps a
// crafted value out of buildFolderKey.

describe("isValidFolderTarget", () => {
  it("accepts every quarter destination with a known category", () => {
    for (const d of ["Summer", "Q1", "Q2", "Q3", "Q4"]) {
      expect(isValidFolderTarget(d, "Lessons")).toBe(true);
    }
  });

  it("accepts YearPlan without a category", () => {
    expect(isValidFolderTarget("YearPlan", undefined)).toBe(true);
    expect(isValidFolderTarget("YearPlan", "anything")).toBe(true);
  });

  it("rejects unknown destinations", () => {
    expect(isValidFolderTarget("Q9", "Lessons")).toBe(false);
    expect(isValidFolderTarget("../etc", "Lessons")).toBe(false);
    expect(isValidFolderTarget("", "Lessons")).toBe(false);
    expect(isValidFolderTarget(undefined, "Lessons")).toBe(false);
    expect(isValidFolderTarget(42, "Lessons")).toBe(false);
  });

  it("rejects unknown categories on quarter destinations", () => {
    expect(isValidFolderTarget("Q1", "NotACategory")).toBe(false);
    expect(isValidFolderTarget("Q1", "")).toBe(false);
    expect(isValidFolderTarget("Q1", undefined)).toBe(false);
    expect(isValidFolderTarget("Q1", null)).toBe(false);
  });
});
