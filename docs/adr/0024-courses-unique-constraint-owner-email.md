# ADR-0024: Widen courses unique constraint to include `owner_email`

- **Status:** Proposed
- **Date:** 2026-06-22
- **Deciders:** Jason
- **Tags:** schema

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

The `courses` table has a unique constraint `uq_courses_grade_subject_year` on `(grade, subject, school_year_id)`. After ADR-0021 added `owner_email` for per-user ownership, this constraint prevents two different teachers from creating a course with the same grade, subject, and school year — the second teacher's `INSERT` fails with a unique-violation error.

How should the uniqueness constraint be adjusted so that each teacher can independently create courses for the same grade/subject/year combination?

## Decision Drivers

- **Multi-user correctness.** Two teachers must be able to own a "Grade 8 ELA 2026-2027" course independently. The current constraint makes this impossible.
- **Data integrity.** A single teacher should still not be able to create duplicate courses for the same grade/subject/year — the constraint should prevent accidental duplicates within one teacher's data.
- **Migration safety.** The constraint change must be safe on a live database with existing data. Dropping and re-creating a unique constraint is a metadata-only operation in PostgreSQL and does not require a full table rewrite.
- **NULL semantics.** In PostgreSQL, `NULL != NULL` in unique constraints. Rows with `owner_email IS NULL` (pre-backfill legacy rows) are each treated as distinct and will never violate the new constraint against each other or against owned rows.

## Considered Options

- **Option A:** Widen the existing unique constraint to `(grade, subject, school_year_id, owner_email)`
- **Option B:** Drop the unique constraint entirely and enforce uniqueness in application code
- **Option C:** Keep the current constraint and require a shared-course model (one course row per grade/subject/year, multiple owners via a join table)

## Decision Outcome

Chosen option: **Option A — widen the unique constraint to include `owner_email`**, because it preserves database-level duplicate prevention per teacher while unblocking multi-user course creation. The migration is a metadata-only DDL change with no data movement.

## Consequences

### Positive

- **Multi-user unblocked.** Each teacher can create their own course for any grade/subject/year without conflicting with other teachers.
- **Per-teacher duplicate prevention preserved.** A single teacher still cannot accidentally create two identical courses.
- **Zero-downtime migration.** `DROP CONSTRAINT` + `ADD CONSTRAINT UNIQUE` on the same columns (plus one) is a metadata operation; no table rewrite or lock escalation.

### Negative

- **NULL owner_email bypasses uniqueness.** Legacy rows with `owner_email IS NULL` are invisible to the constraint (PostgreSQL treats each NULL as distinct). Two unowned rows with the same grade/subject/year can coexist. This is acceptable during the migration window but reinforces the need to backfill `owner_email` on existing rows.

### Neutral

- **Constraint name changes.** `uq_courses_grade_subject_year` becomes `uq_courses_grade_subject_year_owner`. Any tooling or error-handling code that references the old constraint name by string must be updated (no such references exist today).

## Pros and Cons of the Options

### Option A: Widen unique constraint to include `owner_email`

- ✅ Pro: Database-enforced uniqueness per teacher — no application-layer bugs can create duplicates.
- ✅ Pro: Minimal migration — two DDL statements, no data changes.
- ✅ Pro: Follows the ownership model established in ADR-0021; the constraint now reflects the ownership column.
- ❌ Con: NULL `owner_email` rows are exempt from uniqueness checks until backfilled.

### Option B: Drop unique constraint, enforce in application code

- ✅ Pro: No constraint to manage; simplest DDL change.
- ❌ Con: Race conditions — two concurrent `INSERT`s for the same teacher/grade/subject/year can both succeed.
- ❌ Con: Every code path that creates courses must remember to check for duplicates; easy to miss.
- ❌ Con: Gives up a database-level invariant for no benefit.

### Option C: Shared-course model with join table

- ✅ Pro: Normalized — one course row, many owners.
- ❌ Con: Major schema redesign (new join table, FK changes, query rewrites) for a problem that Option A solves with two DDL statements.
- ❌ Con: Conflates "shared course" with "independently owned course" — teachers may want different descriptions, notes, or pacing for the same grade/subject/year.

## Implementation notes

- **Migration:** `drizzle/0008_courses_unique_add_owner_email.sql` — drops `uq_courses_grade_subject_year`, adds `uq_courses_grade_subject_year_owner` on `(grade, subject, school_year_id, owner_email)`.
- **Schema:** `src/db/schema/courses.ts` — `unique("uq_courses_grade_subject_year_owner")` updated to include `table.ownerEmail`.
- **Backfill (recommended):** `UPDATE courses SET owner_email = '<teacher-email>' WHERE owner_email IS NULL;` — closes the NULL-bypass gap in the uniqueness constraint. Same recommendation as ADR-0021.

## Links

- [ADR-0021](0021-course-ownership-column.md) — introduced `owner_email` on `courses`.
- [ADR-0023](0023-unit-ownership-user-id-column.md) — related ownership pattern on `units`.
- [PostgreSQL UNIQUE constraints and NULLs](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-UNIQUE-CONSTRAINTS) — documents NULL-distinct behavior in unique constraints.
