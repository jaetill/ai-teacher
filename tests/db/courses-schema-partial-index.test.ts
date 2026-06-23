import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";

const schemaSource = readFileSync(join(process.cwd(), "src/db/schema/courses.ts"), "utf8");

const snapshot = JSON.parse(
  readFileSync(join(process.cwd(), "drizzle/meta/0008_snapshot.json"), "utf8"),
);

describe("courses schema — partial index for NULL-owner rows", () => {
  it("declares uq_courses_null_owner in the TypeScript schema", () => {
    expect(schemaSource).toContain("uq_courses_null_owner");
    expect(schemaSource).toContain("owner_email IS NULL");
  });

  it("captures uq_courses_null_owner in the 0008 Drizzle snapshot", () => {
    const coursesIndexes = snapshot.tables["public.courses"]?.indexes ?? {};
    expect(coursesIndexes).toHaveProperty("uq_courses_null_owner");
    expect(coursesIndexes["uq_courses_null_owner"].isUnique).toBe(true);
    expect(coursesIndexes["uq_courses_null_owner"].where).toBe("owner_email IS NULL");
  });

  it("snapshot has no stale uq_courses_grade_subject_year constraint that would hide drift", () => {
    const uniqueConstraints = snapshot.tables["public.courses"]?.uniqueConstraints ?? {};
    expect(uniqueConstraints).not.toHaveProperty("uq_courses_grade_subject_year");
    expect(uniqueConstraints).toHaveProperty("uq_courses_grade_subject_year_owner");
  });
});
