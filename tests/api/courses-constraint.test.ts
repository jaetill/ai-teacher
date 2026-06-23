import { describe, it, expect } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { courses } from "../../src/db/schema/courses";

// Guards against migrations that silently drop or widen the unique constraint on
// courses. The constraint must include owner_email so that two different teachers
// can each hold a course for the same grade + subject + school year (cross-owner
// coexistence), while the same teacher is still blocked from creating duplicates
// (same-owner dedup). See ADR-0024 and issue #362.
describe("courses unique constraint", () => {
  const config = getTableConfig(courses);
  const ownerConstraint = config.uniqueConstraints.find(
    (uc) => uc.name === "uq_courses_grade_subject_year_owner",
  );

  it("names the constraint uq_courses_grade_subject_year_owner", () => {
    expect(ownerConstraint).toBeDefined();
  });

  it("includes owner_email so cross-owner coexistence is allowed", () => {
    const columnNames = ownerConstraint?.columns.map((c) => c.name) ?? [];
    expect(columnNames).toContain("owner_email");
  });

  it("still covers grade + subject + school_year_id for same-owner dedup", () => {
    const columnNames = ownerConstraint?.columns.map((c) => c.name) ?? [];
    expect(columnNames).toContain("grade");
    expect(columnNames).toContain("subject");
    expect(columnNames).toContain("school_year_id");
  });

  it("does not use the old constraint name (uq_courses_grade_subject_year)", () => {
    const oldConstraint = config.uniqueConstraints.find(
      (uc) => uc.name === "uq_courses_grade_subject_year",
    );
    expect(oldConstraint).toBeUndefined();
  });
});
