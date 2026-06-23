# ADR-0024: Owner-scoped unique constraint on `courses` table

- **Status:** Proposed
- **Date:** 2026-06-23
- **Deciders:** Jason
- **Tags:** schema, data-integrity

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

ADR-0021 added a nullable `owner_email` column to `courses` but did not update the existing unique constraint `uq_courses_grade_subject_year(grade, subject, school_year_id)`. The constraint still enforces global uniqueness — two different teachers cannot independently create courses for the same grade, subject, and school year. Worse, because `owner_email` is nullable and PostgreSQL treats `NULL != NULL` in standard unique constraints, the widened constraint alone would place no uniqueness restriction on rows where `owner_email IS NULL`, allowing unlimited duplicate ownerless courses (issue #361).

How should the unique constraint on `courses` be updated to support per-owner course creation while preserving uniqueness guarantees for both owned and ownerless rows?

## Decision Drivers

- **Multi-teacher correctness.** Different teachers must be able to create courses for the same (grade, subject, year) independently. The global constraint blocks this.
- **NULL safety.** Routes that omit `ownerEmail` on INSERT (tracked in #206 and #207) still exist. Without a NULL-aware constraint, these routes could silently create duplicate ownerless courses.
- **PostgreSQL NULL semantics.** A standard `UNIQUE(grade, subject, school_year_id, owner_email)` constraint treats `NULL != NULL` — it will not prevent duplicates among rows where `owner_email IS NULL`.
- **Migration safety.** The constraint change must be non-destructive — existing data must not violate the new constraint.

## Considered Options

- **Option A:** Widen the unique constraint to include `owner_email` plus add a partial unique index for NULL rows
- **Option B:** Widen the unique constraint to include `owner_email` only (no NULL guard)
- **Option C:** Keep the global constraint and require a single shared course per (grade, subject, year)

## Decision Outcome

Chosen option: **Option A — owner-scoped unique constraint with partial NULL index**, because it is the only option that simultaneously enables multi-teacher course creation and closes the NULL-duplicate gap identified in #361.

## Consequences

### Positive

- **Multi-teacher support.** Two teachers can independently create courses for the same (grade, subject, year) without constraint violations.
- **NULL-duplicate prevention.** The partial index `uq_courses_null_owner ON (grade, subject, school_year_id) WHERE owner_email IS NULL` enforces exactly-one ownerless row per (grade, subject, year), closing the gap before INSERT routes are fixed.
- **No data migration required.** Existing rows have at most one course per (grade, subject, year) — the new constraint is strictly less restrictive for non-NULL owners and equivalent for NULL owners.

### Negative

- **Two DDL objects for one logical rule.** The standard unique constraint handles owned rows; the partial unique index handles NULL rows. Future developers must understand both to reason about course uniqueness.
- **Partial index is PostgreSQL-specific.** If the database engine ever changes, the NULL-guard strategy must be revisited (low risk — Neon is PostgreSQL).

### Neutral

- **Constraint name changes.** `uq_courses_grade_subject_year` is dropped and replaced by `uq_courses_grade_subject_year_owner`. Any raw SQL references to the old constraint name will break (none found in codebase; Drizzle ORM abstracts constraint names).

## Pros and Cons of the Options

### Option A: Owner-scoped constraint + partial NULL index

- ✅ Pro: Enables multi-teacher course creation — different owners are independent.
- ✅ Pro: Closes the NULL-duplicate gap at the database level — no application-layer workaround needed.
- ✅ Pro: Non-destructive migration — existing data satisfies both the new constraint and the partial index.
- ❌ Con: Two DDL objects (constraint + partial index) for one logical uniqueness rule.
- ❌ Con: Partial unique indexes are a PostgreSQL-specific feature.

### Option B: Owner-scoped constraint only (no NULL guard)

- ✅ Pro: Simpler — single DDL change, no partial index.
- ✅ Pro: Enables multi-teacher course creation.
- ❌ Con: NULL-owner rows have no uniqueness enforcement. Routes that omit `ownerEmail` on INSERT can silently create unlimited duplicate courses — exactly the bug flagged in #361.
- ❌ Con: Relies on all INSERT routes being fixed before the constraint change ships — but #206 and #207 are still open.

### Option C: Keep global constraint

- ✅ Pro: No migration, no schema change.
- ✅ Pro: Simplest uniqueness model — one course per (grade, subject, year) globally.
- ❌ Con: Blocks multi-teacher use. Two teachers cannot independently plan the same grade/subject/year.
- ❌ Con: Contradicts the ownership model established in ADR-0021.

## Implementation notes

- **Migration:** `drizzle/0008_courses_unique_add_owner_email.sql` — three statements: DROP old constraint, ADD owner-scoped constraint, CREATE partial unique index.
- **Schema:** `src/db/schema/courses.ts` — Drizzle `unique()` declaration updated to include `ownerEmail`. (The partial index is not representable in Drizzle's schema DSL; it lives only in the raw migration SQL.)
- **Tests:** `tests/db/migration-0008.test.ts` — file-content assertions verifying the migration SQL contains the DROP, ADD, and partial index statements.
- **Follow-up — fix INSERT routes:** Issues #206 and #207 track routes that omit `ownerEmail` on INSERT. Once those are fixed, the partial NULL index becomes a safety net rather than the primary guard.
- **Follow-up — identity convergence:** When a `users` table is introduced (per ADR-0021, ADR-0023), the constraint should migrate from `owner_email` to `owner_id uuid`.

## Links

- [Issue #361](https://github.com/jaetill/ai-teacher/issues/361) — code-review finding that prompted this change.
- [ADR-0021](0021-course-ownership-column.md) — introduced `owner_email` on `courses`.
- [ADR-0023](0023-unit-ownership-user-id-column.md) — parallel ownership work on `units`.
- [PostgreSQL partial indexes](https://www.postgresql.org/docs/current/indexes-partial.html) — the mechanism used for the NULL-owner uniqueness guard.
