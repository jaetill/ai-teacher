import { describe, it, expect } from "vitest";
import type { ScannedNode } from "@/lib/drive";
import {
  applyLevelMap,
  normalizeQuarter,
  proposeLevelMap,
  quarterTagIn,
  validateLevelMap,
} from "@/lib/import-structure";

// ── tree builders ───

let seq = 0;
function file(name: string): ScannedNode {
  return {
    id: `f${++seq}`,
    name,
    mimeType: "application/vnd.google-apps.document",
    isFolder: false,
    children: [],
  };
}
function folder(name: string, ...children: ScannedNode[]): ScannedNode {
  return {
    id: `d${++seq}`,
    name,
    mimeType: "application/vnd.google-apps.folder",
    isFolder: true,
    children,
  };
}

describe("normalizeQuarter — the name IS a quarter", () => {
  it.each([
    ["Q1", "Q1"],
    ["q3", "Q3"],
    ["Quarter 2", "Q2"],
    ["4th Quarter", "Q4"],
    ["Grade 7 Q1", "Q1"],
    ["Summer Reading", "Summer"],
    ["Year Plan", "YearPlan"],
    ["Pacing Guide", "YearPlan"],
  ])("reads %s as %s", (input, expected) => {
    expect(normalizeQuarter(input)).toBe(expected);
  });

  // The bug this function exists to prevent: her Grade 6 folders are named for
  // the book with the quarter after it, and reading them as quarters produced
  // "8 of 8 subfolders read as quarters" for a folder holding eight units.
  it.each(["Dash Q3", "Refugee Q4", "Before the Ever After Q2", "The Giver Q1"])(
    "does NOT read %s as a quarter — it is a unit that mentions one",
    (name) => {
      expect(normalizeQuarter(name)).toBeNull();
    },
  );

  it("returns null for names that are not quarters at all", () => {
    expect(normalizeQuarter("The Westing Game")).toBeNull();
    expect(normalizeQuarter("Roll of Thunder")).toBeNull();
  });

  it("does not read a bare digit as a quarter", () => {
    expect(normalizeQuarter("Unit 2")).toBeNull();
  });
});

describe("quarterTagIn — the quarter a name MENTIONS", () => {
  it.each([
    ["Dash Q3", "Q3"],
    ["Refugee Q4", "Q4"],
    ["Before the Ever After Q2", "Q2"],
    ["Q1", "Q1"],
  ])("pulls %s out of the name as %s", (input, expected) => {
    expect(quarterTagIn(input)).toBe(expected);
  });

  it("is null when no quarter is mentioned", () => {
    expect(quarterTagIn("The Westing Game")).toBeNull();
  });
});

describe("validateLevelMap", () => {
  it("accepts maps that only ever go deeper", () => {
    expect(validateLevelMap(["year", "quarter", "unit"])).toEqual([]);
    expect(validateLevelMap(["unit"])).toEqual([]);
    expect(validateLevelMap(["container"])).toEqual([]);
    expect(validateLevelMap(["grade", "year", "quarter", "unit"])).toEqual([]);
  });

  it("lets container appear anywhere without breaking nesting", () => {
    expect(validateLevelMap(["container", "quarter", "container", "unit"])).toEqual([]);
  });

  it("rejects a unit containing a quarter", () => {
    const errors = validateLevelMap(["unit", "quarter"]);
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe("not_nested");
  });

  it("rejects repeating a level", () => {
    expect(validateLevelMap(["unit", "unit"])[0].code).toBe("not_nested");
  });

  it("rejects an empty map and unknown kinds", () => {
    expect(validateLevelMap([])[0].code).toBe("empty");
    // @ts-expect-error deliberately invalid kind
    expect(validateLevelMap(["lesson"])[0].code).toBe("unknown_kind");
  });
});

describe("applyLevelMap", () => {
  it("['unit'] makes the whole subtree one unit, however deep it goes", () => {
    const tree = folder(
      "The Giver",
      file("giver-ch1.pptx"),
      folder("Handouts", file("vocab.docx"), folder("Extra", file("map.pdf"))),
    );

    const plan = applyLevelMap(tree, ["unit"]);

    expect(plan.units).toEqual(["The Giver"]);
    expect(plan.materials).toHaveLength(3);
    expect(plan.materials.every((m) => m.unit === "The Giver")).toBe(true);
    expect(plan.warnings).toEqual([]);
  });

  it("regression #682: a nested folder never becomes its own unit", () => {
    // "Dash Q3/Letters/" used to come back with unit "Letters" — the deepest
    // folder won, and Dash never existed as a unit at all.
    const tree = folder("Dash Q3", folder("Letters", file("letter-1.docx")));

    const plan = applyLevelMap(tree, ["unit"]);

    expect(plan.units).toEqual(["Dash Q3"]);
    expect(plan.materials[0].unit).toBe("Dash Q3");
  });

  it("['container','unit'] makes each child folder a unit", () => {
    const tree = folder(
      "Grade 7",
      folder("The Giver", file("giver.pptx")),
      folder("Fever 1793", file("fever.pptx"), file("fever-quiz.docx")),
    );

    const plan = applyLevelMap(tree, ["container", "unit"]);

    expect(plan.units).toEqual(["The Giver", "Fever 1793"]);
    expect(plan.materials.map((m) => m.unit)).toEqual(["The Giver", "Fever 1793", "Fever 1793"]);
  });

  it("['year','quarter','unit'] resolves all three levels", () => {
    const tree = folder(
      "Grade 7 2025-26",
      folder("Q1", folder("Fever 1793", file("fever.pptx"))),
      folder("Quarter 2", folder("The Westing Game", file("westing.pptx"))),
    );

    const plan = applyLevelMap(tree, ["year", "quarter", "unit"]);

    expect(plan.quarters).toEqual(["Q1", "Q2"]);
    expect(plan.units).toEqual(["Fever 1793", "The Westing Game"]);
    expect(plan.materials).toEqual([
      expect.objectContaining({ quarter: "Q1", unit: "Fever 1793" }),
      expect.objectContaining({ quarter: "Q2", unit: "The Westing Game" }),
    ]);
  });

  it("flattens anything deeper than the map instead of inventing levels", () => {
    const tree = folder(
      "Q1",
      folder(
        "The Giver",
        folder("Lessons", file("ch1.pptx")),
        folder("Assessments", folder("Retakes", file("quiz-retake.docx"))),
      ),
    );

    const plan = applyLevelMap(tree, ["quarter", "unit"]);

    expect(plan.units).toEqual(["The Giver"]);
    expect(plan.materials).toHaveLength(2);
    expect(plan.materials.every((m) => m.unit === "The Giver")).toBe(true);
    expect(plan.materials.every((m) => m.quarter === "Q1")).toBe(true);
  });

  it("keeps the folder path for provenance", () => {
    const tree = folder("Q1", folder("The Giver", folder("Lessons", file("ch1.pptx"))));

    const plan = applyLevelMap(tree, ["quarter", "unit"]);

    expect(plan.materials[0].path).toEqual(["The Giver", "Lessons"]);
  });

  it("['container'] declares no structure — every file is loose material", () => {
    const tree = folder("Dumping Ground", file("a.docx"), folder("Sub", file("b.docx")));

    const plan = applyLevelMap(tree, ["container"]);

    expect(plan.units).toEqual([]);
    expect(plan.quarters).toEqual([]);
    expect(plan.materials.every((m) => m.unit === null && m.quarter === null)).toBe(true);
    // No unit was declared, so loose files are expected, not a warning.
    expect(plan.warnings).toEqual([]);
  });

  it("warns when a folder declared a quarter does not read as one", () => {
    const tree = folder("Year", folder("Novels", folder("The Giver", file("g.pptx"))));

    const plan = applyLevelMap(tree, ["year", "quarter", "unit"]);

    expect(plan.quarters).toEqual([]);
    expect(plan.warnings.join(" ")).toContain('"Novels"');
    expect(plan.materials[0].quarter).toBeNull();
    expect(plan.materials[0].unit).toBe("The Giver");
  });

  it("warns about files that fall outside every declared unit", () => {
    const tree = folder("Q1", file("syllabus.docx"), folder("The Giver", file("giver.pptx")));

    const plan = applyLevelMap(tree, ["quarter", "unit"]);

    expect(plan.warnings.join(" ")).toContain("1 file");
    expect(plan.materials.find((m) => m.name === "syllabus.docx")!.unit).toBeNull();
  });

  it("refuses an invalid map rather than silently picking a reading", () => {
    expect(() => applyLevelMap(folder("x"), ["unit", "quarter"])).toThrow(/invalid level map/);
  });
});

describe("proposeLevelMap", () => {
  it("reads quarter-named children as a whole year", () => {
    const tree = folder(
      "Grade 7",
      folder("Q1", folder("Fever", file("a.pptx"))),
      folder("Q2", folder("Westing", file("b.pptx"))),
      folder("Q3"),
      folder("Q4"),
    );

    const proposal = proposeLevelMap(tree);

    expect(proposal.levels).toEqual(["year", "quarter", "unit"]);
    expect(proposal.alternatives[0].levels).toEqual(["container", "quarter", "unit"]);
  });

  // Her real Grade 6 folder, 2026-08-24. Eight units, each named for the book
  // with the quarter after it, and no quarter folders at all. The first version
  // called this "8 of 8 subfolders read as quarters" and proposed a whole year.
  it("reads book-name-plus-quarter folders as units, not as eight quarters", () => {
    const tree = folder(
      "Grade 6 English",
      folder("Dash Q3", file("dash.pptx")),
      folder("Refugee Q4", file("refugee.pptx")),
      folder("Before the Ever After Q2", file("beforeafter.pptx")),
      folder("The Giver Q1", file("giver.pptx")),
      folder("Wonder Q1", file("wonder.pptx")),
      folder("Hatchet Q2", file("hatchet.pptx")),
      folder("Freak the Mighty Q3", file("freak.pptx")),
      folder("Esperanza Rising Q4", file("esperanza.pptx")),
    );

    const proposal = proposeLevelMap(tree);

    expect(proposal.levels).toEqual(["container", "unit"]);
    expect(proposal.reason).toMatch(/each one is a unit/i);

    const plan = applyLevelMap(tree, proposal.levels);
    expect(plan.units).toHaveLength(8);
    expect(plan.units).toContain("Dash Q3");
    // And the quarter suffix places each unit for free.
    expect(plan.materials.find((m) => m.unit === "Dash Q3")!.quarter).toBe("Q3");
    expect(plan.materials.find((m) => m.unit === "Refugee Q4")!.quarter).toBe("Q4");
    expect(new Set(plan.quarters)).toEqual(new Set(["Q1", "Q2", "Q3", "Q4"]));
  });

  it("does not call it a year when two subfolders claim the same quarter", () => {
    const tree = folder(
      "Grade 6",
      folder("Q1", file("a.pptx")),
      folder("Quarter 1", file("b.pptx")),
    );

    expect(proposeLevelMap(tree).levels).not.toEqual(["year", "quarter", "unit"]);
  });

  it("reads a quarter-named root as a quarter of units", () => {
    const tree = folder("Grade 7 Q3", folder("The Outsiders", file("o.pptx")));

    expect(proposeLevelMap(tree).levels).toEqual(["quarter", "unit"]);
  });

  it("takes the coarser reading when subfolders are ambiguous", () => {
    // Could be two units, or one unit organised into two folders. Nothing in
    // the tree says which, and over-splitting is the verified failure mode.
    const tree = folder(
      "Roll of Thunder",
      folder("Lessons", file("a.pptx")),
      folder("Assessments", file("b.docx")),
    );

    const proposal = proposeLevelMap(tree);

    expect(proposal.levels).toEqual(["unit"]);
    expect(proposal.alternatives[0].levels).toEqual(["container", "unit"]);
  });

  it("proposes no structure for a folder of loose files", () => {
    expect(proposeLevelMap(folder("Misc", file("a.docx"))).levels).toEqual(["container"]);
  });

  it("always proposes a map that validates", () => {
    const trees = [
      folder("Grade 7", folder("Q1"), folder("Q2")),
      folder("Q3", folder("Outsiders")),
      folder("Roll of Thunder", folder("Lessons")),
      folder("Misc", file("a.docx")),
    ];
    for (const tree of trees) {
      const proposal = proposeLevelMap(tree);
      expect(validateLevelMap(proposal.levels)).toEqual([]);
      for (const alt of proposal.alternatives) {
        expect(validateLevelMap(alt.levels)).toEqual([]);
      }
    }
  });
});
