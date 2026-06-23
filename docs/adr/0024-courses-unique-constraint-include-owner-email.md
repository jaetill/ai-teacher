# ADR-0024: Widen `courses` unique constraint to include `owner_email`

- **Status:** Proposed
- **Date:** 2026-06-23
- **Deciders:** Jason
- **Tags:** schema

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

ADR-0021 added an `owner_email` column to `courses` so that API routes could enforce per-user access control. However, the existing unique constraint `uq_courses_grade_subject_year(grade, subject, school_year_id)` was not updated. This means two different teachers who both teach the same grade, subject, and school year cannot each have their own course row — the second `INSERT` violates the constraint and returns a 500 error (issue #362, related to issue #224).

Should the unique constraint be widened to include `owner_email`, allowing cross-owner coexistence while still preventing same-owner duplicates?

## Decision Drivers

- **Multi-teacher correctness.** Two teachers teaching Grade 8 ELA in the same school year is a normal scenario. The constraint must not treat this as a duplicate.
- **Same-owner dedup.** A single teacher should still be prevented from accidentally creating two identical courses for the same grade, subject, and school year.
- **Backward compatibility.** The migration must be safe to run on a live database with existing data. Widening a unique constraint (adding a column) can never cause existing rows to violate the new constraint — it only relaxes the restriction.
- **Consistency with ADR-0021.** The ownership model added `owner_email` as the per-row identity claim. The unique constraint should reflect that ownership boundary.

## Considered Options

- **Option A:** Widen the constraint to `(grade, subject, school_year_id, owner_email)` — one migration, drop-and-recreate
- **Option B:** Keep the original constraint and enforce cross-owner coexistence in application code (catch the constraint violation, check if the colliding row belongs to a different owner, and allow it)
- **Option C:** Drop the unique constraint entirely — rely on application-layer validation only

## Decision Outcome

Chosen option: **Option A — widen the constraint to include `owner_email`**, because it is the simplest change that correctly models the ownership boundary at the database level, is safe to migrate, and preserves same-owner dedup without application-layer workarounds.

## Consequences

### Positive

- **Cross-owner coexistence.** Two teachers can each have a course for the same grade + subject + school year without 500 errors.
- **Same-owner dedup preserved.** A single teacher is still blocked from creating duplicate courses for the same tuple.
- **Database-level enforcement.** The invariant is enforced by PostgreSQL, not application code — no route can accidentally bypass it.
- **Safe migration.** Widening a unique constraint only relaxes restrictions; existing rows cannot violate the new constraint.

### Negative

- **`NULL` owner_email bypasses uniqueness.** PostgreSQL treats each `NULL` as distinct in unique constraints, so rows with `owner_email = NULL` (pre-backfill legacy rows) are never blocked by this constraint. This is acceptable during the migration window but means the dedup guarantee only applies to backfilled rows.
- **Constraint name changes.** Any code or tooling that references `uq_courses_grade_subject_year` by name will break. In practice, only Drizzle schema definitions reference constraint names, and the schema file is updated in this PR.

### Neutral

- **No new columns or tables.** This is a constraint-only change — the `owner_email` column already exists from ADR-0021.
- **Regression test added.** `tests/api/courses-constraint.test.ts` guards against future migrations that silently drop or widen the constraint. The tests use `getTableConfig` from `drizzle-orm/pg-core` to inspect the TypeScript schema definition directly — zero I/O, deterministic, runs in the standard Vitest suite.

## Pros and Cons of the Options

### Option A: Widen constraint to `(grade, subject, school_year_id, owner_email)`

- ✅ Pro: One migration — `DROP CONSTRAINT` + `ADD CONSTRAINT` in a single file.
- ✅ Pro: Invariant enforced at the database level — no application-code workaround needed.
- ✅ Pro: Widening a constraint is always safe for existing data.
- ✅ Pro: Aligns the constraint boundary with the ownership boundary from ADR-0021.
- ❌ Con: `NULL` owner_email rows bypass the uniqueness check (PostgreSQL `NULL ≠ NULL` semantics).

### Option B: Keep original constraint, handle collisions in application code

- ✅ Pro: No schema migration needed.
- ❌ Con: Every course-creation route must catch the constraint violation, query the colliding row, check ownership, and decide whether to allow or reject — complex, error-prone, and easy to forget in new routes.
- ❌ Con: The database allows a state (two rows with same tuple, different owners) that the constraint says is invalid — the schema lies about its own invariant.

### Option C: Drop the unique constraint entirely

- ✅ Pro: Eliminates the cross-owner collision problem entirely.
- ❌ Con: Loses same-owner dedup — a teacher can accidentally create duplicate courses with no database-level guard.
- ❌ Con: Shifts all validation to application code with no safety net.

## Implementation notes

- **Migration:** `drizzle/0008_courses_unique_add_owner_email.sql` — drops `uq_courses_grade_subject_year`, adds `uq_courses_grade_subject_year_owner(grade, subject, school_year_id, owner_email)`.
- **Schema:** `src/db/schema/courses.ts` — constraint definition updated to include `table.ownerEmail`.
- **Tests:** `tests/api/courses-constraint.test.ts` — four schema-level regression tests using `getTableConfig`.
- **Follow-up — NULL backfill:** Once all existing course rows have `owner_email` populated (see ADR-0021 backfill note), the `NULL` bypass becomes moot. When a `users` table lands and `owner_email` is replaced with a `NOT NULL` FK, the constraint will enforce dedup unconditionally.

## Links

- [Issue #362](https://github.com/jaetill/ai-teacher/issues/362) — the constraint guard test request that triggered this work.
- [Issue #224](https://github.com/jaetill/ai-teacher/issues/224) — the original cross-owner collision bug report.
- [ADR-0021](0021-course-ownership-column.md) — added `owner_email` to `courses`; this ADR fixes the constraint that ADR-0021 left unchanged.
- [PostgreSQL UNIQUE constraints and NULLs](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-UNIQUE-CONSTRAINTS) — documents `NULL ≠ NULL` behavior in unique constraints.
