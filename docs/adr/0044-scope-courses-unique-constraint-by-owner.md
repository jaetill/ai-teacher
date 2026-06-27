# ADR-0044: Scope `courses` unique constraint by `owner_email`

- **Status:** Proposed
- **Date:** 2026-06-27
- **Deciders:** Jason
- **Tags:** schema, authorization

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

The `courses` table had a unique constraint on `(grade, subject, school_year_id)` with no owner dimension. When two teachers imported curricula for the same grade/subject/year combination, the second teacher's `INSERT ... ON CONFLICT DO NOTHING` silently suppressed the insert, and the fallback `SELECT` (filtered only by `grade`) returned the first teacher's course row. The second teacher's units were then attached to the wrong course — a cross-user data integrity violation (issue #143).

How should the unique constraint and fallback query be scoped so that each teacher's course rows are isolated?

## Decision Drivers

- **Data isolation.** Two teachers with the same grade/subject/year must each get their own course row. The constraint must prevent collisions within a single owner but allow identical tuples across owners.
- **Backward compatibility.** Existing rows may have `owner_email = NULL` (pre-backfill). The migration must not fail on or corrupt those rows.
- **Consistency with ADR-0021.** The `owner_email` column was added in ADR-0021 specifically to enable per-user access control. The unique constraint should use the same column rather than introducing a separate ownership mechanism.
- **Minimal migration risk.** The change should be a pair of DDL statements that can run in a single deployment without downtime.

## Considered Options

- **Option A:** Replace the constraint — drop `uq_courses_grade_subject_year`, add `uq_courses_grade_subject_year_owner` on `(grade, subject, school_year_id, owner_email)`; update the fallback `SELECT` to filter by both `grade` and `ownerEmail`
- **Option B:** Keep the existing constraint and handle isolation in application code only (filter by `owner_email` in queries, accept constraint violations as errors)
- **Option C:** Create a composite primary key on `(grade, subject, school_year_id, owner_email)` replacing the current `id` PK

## Decision Outcome

Chosen option: **Option A — replace the unique constraint and scope the fallback query**, because it enforces owner isolation at the database level while remaining a minimal, backward-compatible DDL change.

## Consequences

### Positive

- **Cross-user collision eliminated.** The database now prevents two teachers from sharing a course row for the same grade/subject/year. Each teacher gets their own row.
- **Fallback query hardened.** The `SELECT` path after a no-op `INSERT` now filters by `(grade, ownerEmail)`, so it can only return the current teacher's row.
- **PostgreSQL NULL semantics are favorable.** `UNIQUE` treats `NULL` values as distinct, so legacy rows with `owner_email = NULL` do not conflict with each other or with owned rows — no backfill prerequisite.

### Negative

- **Irreversible constraint rename.** Rolling back requires a reverse migration to drop the new constraint and recreate the old one. This is straightforward but must be scripted — `drizzle-kit` will not auto-generate the rollback.
- **Partial index coverage.** The new constraint does not index `owner_email` alone. Multi-teacher queries filtered solely by `owner_email` (without grade/subject/year) will not benefit from this index. An additional index may be needed when multi-user load grows (noted in ADR-0021).

### Neutral

- **NULL owner rows are still allowed.** The constraint permits `owner_email = NULL` rows to coexist. This is consistent with ADR-0021's decision to keep the column nullable until a `users` table lands.
- **No new columns or tables.** This change modifies an existing constraint, not the column set.

## Pros and Cons of the Options

### Option A: Replace the unique constraint and scope the fallback query

- ✅ Pro: Database-level enforcement — impossible to violate even from a raw SQL client or future code path that skips the application filter.
- ✅ Pro: Two DDL statements, no data migration needed. Safe for zero-downtime deploy.
- ✅ Pro: Consistent with the `owner_email` column introduced in ADR-0021.
- ❌ Con: Constraint rename requires a scripted rollback migration if reverted.

### Option B: Application-code-only isolation

- ✅ Pro: No DDL change — no migration to deploy or roll back.
- ❌ Con: The old constraint still rejects legitimate inserts from a second teacher with the same grade/subject/year. The application must handle the conflict error and retry, adding complexity.
- ❌ Con: No database guarantee — a bug in any code path that touches `courses` could silently violate isolation.
- ❌ Con: The `ON CONFLICT DO NOTHING` pattern becomes unreliable because the conflict target no longer matches the intended uniqueness semantics.

### Option C: Composite primary key

- ✅ Pro: Strongest possible uniqueness guarantee — the PK itself encodes ownership.
- ❌ Con: Removes the UUID `id` PK, breaking all foreign keys from `units`, `lessons`, and other tables that reference `courses.id`.
- ❌ Con: Massive migration scope — every FK must be rewritten, every query that joins on `courses.id` must change.
- ❌ Con: Disproportionate to the problem. The current UUID PK works; only the uniqueness constraint needed adjustment.

## Implementation notes

- **Migration:** `drizzle/0008_scope_courses_unique_by_owner.sql` — `DROP CONSTRAINT uq_courses_grade_subject_year` then `ADD CONSTRAINT uq_courses_grade_subject_year_owner UNIQUE(grade, subject, school_year_id, owner_email)`
- **Schema:** `src/db/schema/courses.ts` — Drizzle `unique()` definition updated to include `table.ownerEmail`
- **Route fix:** `src/app/api/import/build-curriculum/route.ts` — fallback `SELECT` now uses `and(eq(courses.grade, grade), eq(courses.ownerEmail, ownerEmail))`
- **Test:** `tests/api/import/build-curriculum.test.ts` — new case asserting `and()` is called on the fallback path

## Links

- [Issue #143](https://github.com/jaetill/ai-teacher/issues/143) — the cross-user collision bug this fixes
- [ADR-0021](0021-course-ownership-column.md) — introduced the `owner_email` column on `courses`
- [PostgreSQL UNIQUE and NULLs](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-UNIQUE-CONSTRAINTS) — documents that NULL values are treated as distinct in UNIQUE constraints
