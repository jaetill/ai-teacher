# ADR-0021: Add `owner_email` column to `courses` for per-user data isolation

- **Status:** Proposed
- **Date:** 2026-06-14
- **Deciders:** Jason
- **Tags:** schema, security, multi-tenancy

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

The `courses` table has a unique constraint `uq_courses_grade_subject_year` on `(grade, subject, school_year_id)`. This constraint is globally scoped — it does not account for which teacher owns the course. Two problems surface as soon as a second user is onboarded:

1. **Write collision.** Teacher B cannot create a grade-8 ELA course for the same school year as Teacher A — the INSERT violates the unique constraint and returns a 500.
2. **Write-side IDOR.** The `build-curriculum` route's find-or-create query (`SELECT ... WHERE grade = ?`) has no per-user filter, so Teacher B silently inherits Teacher A's course record and attaches AI-generated units to it.

How should the schema enforce per-user course ownership and prevent cross-user data leakage?

## Decision Drivers

- **Data isolation.** Each teacher's courses must be independent. A write by one user must never mutate or collide with another user's data.
- **Auth model compatibility.** The app uses NextAuth with Google OAuth. The session reliably provides `user.email` but does not yet have a stable internal user ID (no `users` table exists).
- **Migration safety.** The column must be addable to a production table that already contains rows, without downtime or data loss.
- **Incremental adoption.** Auth/multi-user support is being added progressively. The solution should work with today's session model and not require a full user-management system upfront.

## Considered Options

### Sub-decision 1: Ownership identifier column

- **Option A:** `owner_email` (text, nullable) — store the session email directly
- **Option B:** `owner_id` (uuid, FK to a `users` table) — create a users table, reference it
- **Option C:** No column — scope queries via a session-injected RLS policy

### Sub-decision 2: Unique constraint strategy

- **Option D:** Expand existing constraint to include the ownership column
- **Option E:** Drop the cross-user uniqueness constraint entirely

## Decision Outcome

We chose the bundle:

- Sub-decision 1 → **Option A** (`owner_email` text column)
- Sub-decision 2 → **Option D** (expand the unique constraint)

The bundle is internally consistent because the ownership column is the natural partition key for the uniqueness invariant — two teachers should be able to independently own a grade-8 ELA course for the same year, but a single teacher should not have duplicates.

## Consequences

### Positive

- **IDOR eliminated.** Course lookups in `build-curriculum` are now scoped to `WHERE owner_email = ?`, preventing cross-user reads and writes.
- **Constraint collision fixed.** The expanded unique constraint `(grade, subject, school_year_id, owner_email)` allows multiple teachers to have courses for the same grade/subject/year.
- **No new tables required.** Avoids the complexity of a `users` table and FK relationships before the auth model is settled.
- **Zero-downtime migration.** The column is nullable, so `ALTER TABLE ADD COLUMN` does not rewrite existing rows. Existing rows with `NULL` owner_email continue to satisfy the constraint (PostgreSQL treats NULLs as distinct in unique indexes).

### Negative

- **Email is a mutable identifier.** If a teacher changes their Google account email, their courses become orphaned. Acceptable for the current single-teacher deployment; will need a migration path if/when a stable `users` table is introduced.
- **Backfill required.** Existing course rows have `owner_email = NULL` and will not appear in email-scoped queries. A manual `UPDATE courses SET owner_email = '<teacher-email>'` is needed before a second user is onboarded.
- **No FK enforcement.** Unlike a `users` FK, the email column has no referential integrity — any string can be inserted. Risk is low because the value always comes from the authenticated session, never from user input.

### Neutral

- **Column is nullable.** This was chosen for migration safety rather than as a modeling decision. A future ADR may make it `NOT NULL` with a default once all rows are backfilled and the auth model stabilizes.
- **Index added.** `idx_courses_owner_email` supports the per-user query pattern. Marginal storage cost on a small table.

## Pros and Cons of the Options

### Sub-decision 1: Ownership identifier column

| Option | Pros | Cons |
|---|---|---|
| **A: `owner_email` (text)** (chosen) | No new tables; works with current NextAuth session; simple migration | Email is mutable; no FK integrity; not a stable long-term identifier |
| **B: `owner_id` (uuid FK → users)** | Stable identifier; FK integrity; standard relational pattern | Requires creating a `users` table now; adds migration complexity; auth model not yet settled |
| **C: RLS policy** | No schema change to `courses`; policy-level enforcement | Drizzle ORM has limited RLS support; harder to test; requires Postgres roles aligned to app users |

### Sub-decision 2: Unique constraint strategy

| Option | Pros | Cons |
|---|---|---|
| **D: Expand constraint** (chosen) | Preserves per-user uniqueness guarantee; prevents duplicate courses for the same teacher | Slightly more complex constraint; NULLs in the constraint column allow multiple NULL rows (acceptable during backfill) |
| **E: Drop constraint** | Simplest migration | Loses all uniqueness protection; duplicate courses could be created by the same user via race conditions or retries |

## Implementation notes

- **Migration:** `drizzle/0005_add_owner_email_to_courses.sql` — adds column, index, drops and recreates the unique constraint.
- **Schema:** `src/db/schema/courses.ts` — `ownerEmail` field, `idx_courses_owner_email` index, expanded `uq_courses_grade_subject_year`.
- **Auth helper:** `src/lib/auth-helpers.ts` — `requireEmail(session)` extracts email from session, returns null if absent.
- **Route change:** `src/app/api/import/build-curriculum/route.ts` — course SELECT and INSERT now scoped to `ownerEmail`.
- **Backfill (manual):** Before onboarding a second user, run: `UPDATE courses SET owner_email = '<primary-teacher-email>' WHERE owner_email IS NULL`.

## Links

- [Issue #229](https://github.com/jaetill/ai-teacher/issues/229) — unique constraint collision when multiple users create courses.
- [PR #233](https://github.com/jaetill/ai-teacher/pull/233) — implementation PR.
- [PostgreSQL NULL handling in unique constraints](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-UNIQUE-CONSTRAINTS) — NULLs are treated as distinct.
