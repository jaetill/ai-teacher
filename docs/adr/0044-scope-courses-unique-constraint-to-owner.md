# ADR-0044: Scope `courses` unique constraint to include `owner_email`

- **Status:** Proposed
- **Date:** 2026-06-28
- **Deciders:** Jason
- **Tags:** schema

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

ADR-0021 added an `owner_email` column to `courses` to close an IDOR vulnerability, but the existing unique constraint `uq_courses_grade_subject_year` on `(grade, subject, school_year_id)` was not updated to include it. When a second teacher calls `/api/import/build-curriculum` for the same grade, subject, and school year:

1. The `INSERT … ON CONFLICT DO NOTHING` silently drops the second teacher's row because it conflicts with the first teacher's row on the old constraint.
2. The fallback `SELECT` scopes by `ownerEmail` (the second teacher's email) and finds nothing.
3. The route returns a 500.

How should the unique constraint be updated so that each teacher can own their own course row for the same grade/subject/year combination?

## Decision Drivers

- **Multi-teacher correctness.** Two teachers teaching the same grade and subject in the same school year must each get their own isolated course row.
- **Upsert safety.** The `onConflictDoNothing()` + fallback `SELECT` pattern in the import route must resolve per-teacher, not globally.
- **Minimal migration risk.** The constraint change is a `DROP` + `ADD` on a small table. It should be safe to run without downtime, but must not silently corrupt data.
- **Consistency with ADR-0021.** The ownership column already exists and API routes already filter by it; the constraint must match the application-level scoping.

## Considered Options

- **Option A:** Widen the existing unique constraint to `(grade, subject, school_year_id, owner_email)`
- **Option B:** Drop the unique constraint entirely and enforce uniqueness in application code
- **Option C:** Keep the existing constraint and work around it in the import route (e.g., upsert by global key, then assign ownership post-insert)

## Decision Outcome

Chosen option: **Option A — widen the unique constraint to include `owner_email`**, because it aligns the database-level uniqueness guarantee with the per-teacher ownership model already enforced in application code, and the migration is a straightforward two-statement DDL change.

## Consequences

### Positive

- **Multi-teacher import works.** Each teacher's `INSERT` succeeds independently; the `onConflictDoNothing` + fallback `SELECT` resolves to the correct teacher's row.
- **Database-level guarantee.** The constraint prevents duplicate courses for the same teacher/grade/subject/year at the schema level, not just in application logic.
- **Backward compatible.** Existing single-teacher data is unaffected — the constraint is strictly looser (more combinations are now allowed).

### Negative

- **NULL `owner_email` is a partial-unique edge case.** PostgreSQL treats each `NULL` as distinct in unique constraints, so rows with `owner_email IS NULL` are not constrained against each other. This is acceptable because new rows are always stamped with a session email, and legacy `NULL` rows will be backfilled (per ADR-0021).
- **No rollback without data check.** Reverting to the old constraint requires verifying no two teachers share the same `(grade, subject, school_year_id)` tuple — otherwise the `ADD CONSTRAINT` would fail.

### Neutral

- **Constraint name changes.** `uq_courses_grade_subject_year` → `uq_courses_grade_subject_year_owner`. Downstream tooling or queries referencing the old constraint name by string will need updating; Drizzle ORM handles this transparently.

## Pros and Cons of the Options

### Option A: Widen unique constraint to include `owner_email`

- ✅ Pro: Single migration, two DDL statements — minimal risk and complexity.
- ✅ Pro: Matches the application-level ownership scoping already in place.
- ✅ Pro: Standard PostgreSQL pattern for multi-tenant unique constraints.
- ❌ Con: `NULL` `owner_email` values are not fully constrained (PostgreSQL NULL-distinct behavior).

### Option B: Drop the unique constraint entirely

- ✅ Pro: No constraint to conflict with — any insert succeeds.
- ❌ Con: Loses the database-level duplicate guard entirely — bugs in application code could create unbounded duplicate courses.
- ❌ Con: The `onConflictDoNothing` pattern requires a constraint or index to target; removing it breaks the upsert flow.

### Option C: Keep existing constraint, work around in application code

- ✅ Pro: No migration needed.
- ❌ Con: Requires complex application logic — global upsert first, then ownership assignment, with race conditions on the assignment step.
- ❌ Con: The constraint actively prevents the correct behavior (two teachers owning the same grade/subject/year); working around it means fighting the schema.

## Implementation notes

- **Migration:** `drizzle/0008_scope_courses_unique_to_owner.sql` — drops `uq_courses_grade_subject_year`, adds `uq_courses_grade_subject_year_owner` on `(grade, subject, school_year_id, owner_email)`.
- **Schema:** `src/db/schema/courses.ts` — `unique()` definition updated to include `table.ownerEmail`.
- **Drizzle meta:** `0007_snapshot.json` and `0008_snapshot.json` backfilled so `drizzle-kit generate` produces correct diffs going forward.
- **Test:** New test in `tests/api/import/build-curriculum.test.ts` verifying the fallback `SELECT` filters by the second teacher's `ownerEmail`.

## Links

- [ADR-0021](0021-course-ownership-column.md) — introduced `owner_email` column on `courses`.
- [Issue #143](https://github.com/jaetill/ai-teacher/issues/143) — the bug report this PR closes.
