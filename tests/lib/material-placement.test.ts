import { describe, it, expect } from "vitest";
import { derivePlacement, parseFolderKey } from "@/lib/material-placement";

describe("parseFolderKey", () => {
  it("reads grade, quarter and category out of a folder key", () => {
    expect(parseFolderKey("grade_7_Q2_Lessons")).toEqual({
      grade: 7,
      quarter: "Q2",
      category: "Lessons",
    });
  });

  it("handles the category-less year-plan key", () => {
    expect(parseFolderKey("grade_8_YearPlan")).toEqual({
      grade: 8,
      quarter: "YearPlan",
      category: "Uncategorized",
    });
  });

  it("returns null for anything that is not one of our keys", () => {
    expect(parseFolderKey(null)).toBeNull();
    expect(parseFolderKey("")).toBeNull();
    expect(parseFolderKey("Shared with me")).toBeNull();
    expect(parseFolderKey("grade_seven_Q1_Lessons")).toBeNull();
  });
});

describe("derivePlacement", () => {
  it("prefers the placement columns when the material has a course", () => {
    expect(
      derivePlacement({
        courseId: "c1",
        courseGrade: 7,
        quarter: "Q3",
        category: "Activities",
        // A stale folder key must not win over real placement data.
        folderKey: "grade_8_Q1_Lessons",
      }),
    ).toEqual({ grade: 7, quarter: "Q3", category: "Activities", placed: true });
  });

  it("falls back to the folder key for pre-rebuild rows", () => {
    expect(derivePlacement({ folderKey: "grade_6_Q4_Resources" })).toEqual({
      grade: 6,
      quarter: "Q4",
      category: "Resources",
      placed: false,
    });
  });

  it("tolerates a placed material with no quarter — units can sit outside one", () => {
    expect(derivePlacement({ courseId: "c1", courseGrade: 7, quarter: null })).toMatchObject({
      grade: 7,
      quarter: "Other",
      category: "Uncategorized",
      placed: true,
    });
  });

  it("reports an unknown grade rather than guessing one", () => {
    expect(derivePlacement({}).grade).toBeNull();
    expect(derivePlacement({ courseId: "c1" }).grade).toBeNull();
  });
});
