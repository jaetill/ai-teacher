import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "drizzle/0008_courses_unique_add_owner_email.sql"),
  "utf8",
);

describe("drizzle/0008_courses_unique_add_owner_email.sql", () => {
  it("drops the NULL-blind unique constraint", () => {
    expect(sql).toContain('DROP CONSTRAINT "uq_courses_grade_subject_year"');
  });

  it("adds an owner-scoped unique constraint for non-NULL owner_email rows", () => {
    expect(sql).toContain('"uq_courses_grade_subject_year_owner"');
    expect(sql).toContain('"owner_email"');
  });

  it("adds a partial unique index to enforce uniqueness among NULL-owner rows", () => {
    expect(sql).toContain("CREATE UNIQUE INDEX");
    expect(sql).toContain('"uq_courses_null_owner"');
    expect(sql).toContain("WHERE owner_email IS NULL");
  });
});
