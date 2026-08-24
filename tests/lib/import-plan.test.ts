import { describe, it, expect } from "vitest";
import type { ScannedNode } from "@/lib/drive";
import {
  commitPlanMaterials,
  inferCategoryFromPath,
  inferMaterialType,
  previewPlan,
  resolvePlanMaterials,
  resolveTargetCourse,
  validateImportPlan,
  type ImportPlan,
} from "@/lib/import-plan";
import type { PlannedMaterial } from "@/lib/import-structure";

// ── fixtures ───

let seq = 0;
function file(name: string): ScannedNode {
  return {
    id: `f${++seq}`,
    name,
    mimeType: "application/vnd.google-apps.presentation",
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

const VALID: ImportPlan = {
  source: { kind: "drive-folder", folderId: "abc" },
  levels: ["quarter", "unit"],
  target: { grade: 7 },
};

/**
 * A drizzle-shaped fake. Every builder method returns the chain; awaiting it
 * yields the next queued result. Records what was written so assertions can
 * look at the actual row values rather than at call counts.
 */
function fakeDb(results: unknown[] = []) {
  const queue = [...results];
  const calls = {
    inserted: [] as unknown[],
    updated: [] as unknown[],
    selects: 0,
    inserts: 0,
    updates: 0,
  };

  function chain() {
    const c: Record<string, unknown> = {};
    const self = () => c;
    c.from = self;
    c.where = self;
    c.limit = self;
    c.orderBy = self;
    c.onConflictDoNothing = self;
    c.returning = self;
    c.set = (v: unknown) => {
      calls.updated.push(v);
      return c;
    };
    c.then = (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) =>
      Promise.resolve(queue.shift() ?? []).then(r, j);
    return c;
  }

  const db = {
    select: () => {
      calls.selects++;
      return chain();
    },
    insert: () => {
      calls.inserts++;
      const c = chain();
      c.values = (v: unknown) => {
        calls.inserted.push(v);
        return c;
      };
      return c;
    },
    update: () => {
      calls.updates++;
      return chain();
    },
  };

  return { db: db as never, calls };
}

// ── validation ───

describe("validateImportPlan", () => {
  it("accepts a well-formed plan", () => {
    expect(validateImportPlan(VALID)).toEqual([]);
  });

  it("requires a source, levels and a target", () => {
    const fields = validateImportPlan({}).map((e) => e.field);
    expect(fields).toContain("source");
    expect(fields).toContain("levels");
    expect(fields).toContain("target");
  });

  it("rejects an unknown source kind", () => {
    const errors = validateImportPlan({ ...VALID, source: { kind: "dropbox" } });
    expect(errors[0].field).toBe("source.kind");
  });

  it("accepts a single-file source", () => {
    expect(
      validateImportPlan({
        ...VALID,
        source: { kind: "drive-file", fileId: "xyz" },
        levels: ["container"],
      }),
    ).toEqual([]);
  });

  it("surfaces level-map errors against the levels field", () => {
    const errors = validateImportPlan({ ...VALID, levels: ["unit", "quarter"] });
    expect(errors[0].field).toBe("levels");
    expect(errors[0].message).toMatch(/cannot contain/);
  });

  it("rejects an out-of-range grade and a non-UUID school year", () => {
    expect(
      validateImportPlan({ ...VALID, target: { grade: 0 } }).some(
        (e) => e.field === "target.grade",
      ),
    ).toBe(true);
    expect(
      validateImportPlan({ ...VALID, target: { grade: 7, schoolYearId: "last-year" } }).some(
        (e) => e.field === "target.schoolYearId",
      ),
    ).toBe(true);
  });

  it("rejects unknown categories and material types in overrides", () => {
    expect(
      validateImportPlan({ ...VALID, files: [{ fileId: "a", category: "Homework" }] })[0].message,
    ).toMatch(/Homework/);
    expect(
      validateImportPlan({ ...VALID, files: [{ fileId: "a", materialType: "worksheet" }] })[0]
        .message,
    ).toMatch(/worksheet/);
  });

  it("accepts a plan with no school year (a course outside any year)", () => {
    expect(validateImportPlan({ ...VALID, target: { grade: 7, schoolYearId: null } })).toEqual([]);
  });
});

// ── override folding ───

describe("resolvePlanMaterials", () => {
  const planned: PlannedMaterial[] = [
    {
      fileId: "a",
      name: "Giver.pptx",
      mimeType: "ppt",
      quarter: "Q2",
      unit: "The Giver",
      path: [],
    },
    { fileId: "b", name: "loose.docx", mimeType: "doc", quarter: null, unit: null, path: [] },
  ];

  it("fills a missing quarter from the target but never overrides her folders", () => {
    const out = resolvePlanMaterials(planned, { grade: 7, defaultQuarter: "Q4" });
    expect(out.find((m) => m.driveFileId === "a")!.quarter).toBe("Q2");
    expect(out.find((m) => m.driveFileId === "b")!.quarter).toBe("Q4");
  });

  it("leaves quarter null when the target offers no default", () => {
    const out = resolvePlanMaterials(planned, { grade: 7 });
    expect(out.find((m) => m.driveFileId === "b")!.quarter).toBeNull();
  });

  it("applies per-file classification overrides", () => {
    const out = resolvePlanMaterials(planned, { grade: 7 }, [
      { fileId: "a", category: "Lessons", materialType: "lesson" },
    ]);
    expect(out[0]).toMatchObject({ category: "Lessons", materialType: "lesson" });
    // Untouched files keep the safe defaults.
    expect(out[1]).toMatchObject({ category: null, materialType: "other" });
  });

  it("drops files the teacher unticked", () => {
    const out = resolvePlanMaterials(planned, { grade: 7 }, [{ fileId: "b", include: false }]);
    expect(out.map((m) => m.driveFileId)).toEqual(["a"]);
  });

  it("keeps files whose override says nothing about inclusion", () => {
    const out = resolvePlanMaterials(planned, { grade: 7 }, [
      { fileId: "b", category: "Resources" },
    ]);
    expect(out).toHaveLength(2);
  });
});

// ── free classification from her own folder names ───

describe("inferCategoryFromPath", () => {
  it("reads the category out of a folder she already named", () => {
    expect(inferCategoryFromPath(["The Giver", "Lessons"])).toBe("Lessons");
    expect(inferCategoryFromPath(["Q1", "Fever 1793", "Assessments"])).toBe("Assessments");
  });

  it("is case-insensitive and trims", () => {
    expect(inferCategoryFromPath([" resources "])).toBe("Resources");
  });

  it("takes the deepest match", () => {
    expect(inferCategoryFromPath(["Lessons", "Assessments", "Retakes"])).toBe("Assessments");
  });

  it("returns null rather than guessing when no folder says", () => {
    expect(inferCategoryFromPath(["The Giver", "Handouts"])).toBeNull();
    expect(inferCategoryFromPath([])).toBeNull();
  });
});

describe("inferMaterialType", () => {
  it("maps a known category onto its type", () => {
    expect(inferMaterialType("Assessments", "application/pdf")).toBe("assessment");
    expect(inferMaterialType("Activities", "application/pdf")).toBe("activity");
  });

  it("treats a slide deck as a lesson — a lesson is a file, usually a PowerPoint", () => {
    expect(inferMaterialType(null, "application/vnd.google-apps.presentation")).toBe("lesson");
    expect(
      inferMaterialType(
        null,
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ),
    ).toBe("lesson");
  });

  it("lets the category win over the file kind", () => {
    // A deck filed under Assessments is an assessment, not a lesson.
    expect(inferMaterialType("Assessments", "application/vnd.google-apps.presentation")).toBe(
      "assessment",
    );
  });

  it("falls back to other rather than inventing a type", () => {
    expect(inferMaterialType(null, "application/pdf")).toBe("other");
  });
});

describe("resolvePlanMaterials — classification without an AI call", () => {
  it("uses her folder names, and her explicit override beats them", () => {
    const planned: PlannedMaterial[] = [
      {
        fileId: "a",
        name: "Giver.pptx",
        mimeType: "application/vnd.google-apps.presentation",
        quarter: "Q2",
        unit: "The Giver",
        path: ["The Giver", "Assessments"],
      },
    ];

    expect(resolvePlanMaterials(planned, { grade: 7 })[0]).toMatchObject({
      category: "Assessments",
      materialType: "assessment",
    });

    expect(
      resolvePlanMaterials(planned, { grade: 7 }, [{ fileId: "a", category: "Lessons" }])[0],
    ).toMatchObject({ category: "Lessons", materialType: "lesson" });
  });
});

// ── preview ───

describe("previewPlan", () => {
  it("reports units, quarters and materials without touching anything", () => {
    const tree = folder(
      "Grade 7",
      folder("Q1", folder("Fever 1793", file("fever.pptx"))),
      folder("Q2", folder("The Westing Game", file("westing.pptx"), file("wg-quiz.docx"))),
    );

    const preview = previewPlan(tree, {
      source: { kind: "drive-folder", folderId: "x" },
      levels: ["year", "quarter", "unit"],
      target: { grade: 7 },
    });

    expect(preview.units).toEqual(["Fever 1793", "The Westing Game"]);
    expect(preview.quarters).toEqual(["Q1", "Q2"]);
    expect(preview.materials).toHaveLength(3);
    expect(preview.materials[0]).toMatchObject({
      driveFileId: expect.any(String),
      quarter: "Q1",
      sourceUnit: "Fever 1793",
    });
  });

  it("carries structural warnings through to the caller", () => {
    const tree = folder("Q1", file("syllabus.docx"), folder("The Giver", file("g.pptx")));

    const preview = previewPlan(tree, {
      source: { kind: "drive-folder", folderId: "x" },
      levels: ["quarter", "unit"],
      target: { grade: 7 },
    });

    expect(preview.warnings.join(" ")).toContain("1 file");
  });
});

// ── target resolution ───

describe("resolveTargetCourse", () => {
  it("returns an existing course without creating one", async () => {
    const { db, calls } = fakeDb([[{ id: "course-1" }]]);

    const result = await resolveTargetCourse({ grade: 7 }, "t@s.edu", { db, create: true });

    expect(result).toEqual({ id: "course-1", created: false });
    expect(calls.inserts).toBe(0);
  });

  it("does not create when create is not asked for", async () => {
    const { db, calls } = fakeDb([[]]);

    expect(await resolveTargetCourse({ grade: 7 }, "t@s.edu", { db })).toBeNull();
    expect(calls.inserts).toBe(0);
  });

  it("creates a course, titling it from grade and track", async () => {
    const { db, calls } = fakeDb([[], [{ id: "new-course" }]]);

    const result = await resolveTargetCourse(
      { grade: 8, track: "honors", schoolYearId: "11111111-1111-1111-1111-111111111111" },
      "t@s.edu",
      { db, create: true },
    );

    expect(result).toEqual({ id: "new-course", created: true });
    expect(calls.inserted[0]).toMatchObject({
      grade: 8,
      track: "honors",
      subject: "ELA",
      title: "Grade 8 English Language Arts (honors)",
      ownerEmail: "t@s.edu",
    });
  });

  it("stores an untracked course with a null track, not an empty string", async () => {
    const { db, calls } = fakeDb([[], [{ id: "c" }]]);

    await resolveTargetCourse({ grade: 6 }, "t@s.edu", { db, create: true });

    expect((calls.inserted[0] as { track: unknown }).track).toBeNull();
    expect((calls.inserted[0] as { title: string }).title).toBe("Grade 6 English Language Arts");
  });

  it("re-selects after losing a concurrent-create race", async () => {
    // insert returns nothing (onConflictDoNothing), then the row is found.
    const { db } = fakeDb([[], [], [{ id: "raced" }]]);

    expect(await resolveTargetCourse({ grade: 7 }, "t@s.edu", { db, create: true })).toEqual({
      id: "raced",
      created: false,
    });
  });
});

// ── commit ───

describe("commitPlanMaterials", () => {
  const material = (id: string, over = {}) => ({
    driveFileId: id,
    title: `${id}.pptx`,
    driveMimeType: "ppt",
    quarter: "Q1" as const,
    sourceUnit: "The Giver",
    category: "Lessons",
    materialType: "lesson",
    path: [],
    ...over,
  });

  it("references her Drive file in place — no copy, no folder of ours", async () => {
    const { db, calls } = fakeDb([[]]);

    await commitPlanMaterials([material("file-1")], "course-1", "t@s.edu", { db });

    const rows = calls.inserted[0] as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({
      driveFileId: "file-1",
      driveFolderId: null,
      storageType: "google_drive",
      courseId: "course-1",
      quarter: "Q1",
      category: "Lessons",
      sourceUnit: "The Giver",
      ownerEmail: "t@s.edu",
    });
  });

  it("inserts new files and updates ones already in the course", async () => {
    const { db, calls } = fakeDb([[{ id: "row-1", driveFileId: "file-1" }]]);

    const result = await commitPlanMaterials(
      [material("file-1"), material("file-2")],
      "course-1",
      "t@s.edu",
      { db },
    );

    expect(result).toEqual({ created: 1, updated: 1 });
    expect((calls.inserted[0] as Array<{ driveFileId: string }>).map((r) => r.driveFileId)).toEqual(
      ["file-2"],
    );
  });

  it("re-importing the same folder does not duplicate anything", async () => {
    const { db, calls } = fakeDb([
      [
        { id: "row-1", driveFileId: "file-1" },
        { id: "row-2", driveFileId: "file-2" },
      ],
    ]);

    const result = await commitPlanMaterials(
      [material("file-1"), material("file-2")],
      "course-1",
      "t@s.edu",
      { db },
    );

    expect(result).toEqual({ created: 0, updated: 2 });
    expect(calls.inserted).toEqual([]);
  });

  it("never writes description on update — the AI summary is expensive to recompute", async () => {
    const { db, calls } = fakeDb([[{ id: "row-1", driveFileId: "file-1" }]]);

    await commitPlanMaterials([material("file-1")], "course-1", "t@s.edu", { db });

    expect(Object.keys(calls.updated[0] as object)).not.toContain("description");
  });

  it("does nothing at all for an empty plan", async () => {
    const { db, calls } = fakeDb();

    expect(await commitPlanMaterials([], "course-1", "t@s.edu", { db })).toEqual({
      created: 0,
      updated: 0,
    });
    expect(calls.selects).toBe(0);
    expect(calls.inserts).toBe(0);
  });
});
