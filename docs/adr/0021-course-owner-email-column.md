# ADR-0021: Add `owner_email` column to `courses` for row-level ownership

- **Status:** Proposed
- **Date:** 2026-06-13
- **Deciders:** Jason
- **Tags:** schema, security, authorization

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

`GET /api/courses` was authenticated (#217) but returned all courses in the database regardless of who was logged in — a classic IDOR vulnerability (#219). The `courses` table has no column that ties a row to its creator, so the API layer has no way to scope queries to the authenticated user.

How should we associate courses with their owner so that authorization can be enforced at the query level?

## Decision Drivers

- **Security.** The IDOR must be closed: authenticated users must only see their own courses. This is the immediate trigger.
- **Single-user reality.** The app currently serves one teacher (Jason). The ownership column is a pre-condition for safe multi-user support, but the design should not over-engineer for a multi-tenant future that may never arrive.
- **Minimal migration risk.** The production database already has course rows (seeded data). The migration must not break existing data or require coordinated downtime.
- **Auth identity available.** NextAuth sessions expose `session.user.email` reliably. Any other identifier (e.g. a synthetic user ID) would require additional auth plumbing that does not yet exist.

## Considered Options

- **Option A:** Nullable `owner_email text` column on `courses`, keyed to `session.user.email`
- **Option B:** Non-nullable `owner_id uuid` column with a foreign key to a new `users` table
- **Option C:** No schema change — filter in application code using a session-to-course mapping table

## Decision Outcome

Chosen option: **Option A — nullable `owner_email text` column**, because the auth system already surfaces email as the stable user identifier, no `users` table exists yet, and a nullable column avoids a breaking migration for existing rows.

## Consequences

### Positive

- **IDOR closed.** `GET /api/courses` and `POST /api/import/build-curriculum` now scope all queries to the authenticated owner's email. Cross-user data leakage is eliminated at the DB query level.
- **Zero-downtime migration.** The column is nullable, so `ALTER TABLE ... ADD COLUMN` completes without rewriting existing rows. Existing courses get `NULL` and simply stop appearing in API responses until backfilled — consistent with least-privilege.
- **Index supports scoped queries.** `idx_courses_owner_email` ensures the `WHERE owner_email = ?` filter does not degrade to a sequential scan as course count grows.

### Negative

- **Email as identifier is denormalizable.** If the user changes their email, all owned courses become orphaned. Acceptable while the app serves one user; a `users` table with a stable UUID would be needed before real multi-user support.
- **Existing unique constraint conflict.** The existing `uq_courses_grade_subject_year(grade, subject, school_year_id)` does not include `owner_email`. Two users cannot independently own the same grade+subject+year combination. This is a latent bug for multi-user but is harmless in the single-user scenario. A follow-up migration should add `owner_email` to this unique constraint when multi-user is pursued.
- **Orphaned routes.** `POST /api/year-plan/save` also inserts courses but does not yet stamp `owner_email`. Courses inserted through that route will have `NULL` and be invisible via `GET /api/courses`. This is noted in the PR and tracked as a separate gap.

### Neutral

- **No `users` table yet.** This decision explicitly defers the `users` table. When NextAuth is configured with a database adapter or multi-user support is added, the ownership key should migrate from `owner_email` to a foreign-key `owner_id`. That migration can be done incrementally: add `owner_id`, backfill from email lookup, drop `owner_email`.

## Pros and Cons of the Options

### Option A: Nullable `owner_email text` column

- Pro: Uses the identity already available in the session — no new tables or auth changes.
- Pro: Nullable column means zero-risk migration for existing data.
- Pro: Simplest implementation — one column, one index, two API-route changes.
- Con: Email is a mutable, denormalizable identifier.
- Con: No referential integrity (no FK to a `users` table).

### Option B: Non-nullable `owner_id uuid` with `users` table

- Pro: Stable synthetic identifier survives email changes.
- Pro: Referential integrity via foreign key.
- Con: Requires creating a `users` table and a NextAuth database adapter — significant scope increase for a security hotfix.
- Con: Non-nullable column requires a default or backfill for existing rows, complicating the migration.

### Option C: No schema change — application-level mapping

- Pro: No migration needed.
- Con: Requires a separate mapping table or config, adding complexity without adding a queryable ownership signal to the source-of-truth table.
- Con: Every query site must remember to join or filter — easy to miss, hard to audit.

## Implementation notes

- Migration: `drizzle/0005_owner_email_courses.sql`
- Schema: `src/db/schema/courses.ts` — `ownerEmail` field
- Scoped queries: `src/app/api/courses/route.ts`, `src/app/api/import/build-curriculum/route.ts`
- Backfill needed: existing courses with `NULL` owner_email require a one-time `UPDATE courses SET owner_email = '<owner-email>'`
- Follow-up: auth + ownership stamp for `POST /api/year-plan/save`
- Follow-up: add `owner_email` to `uq_courses_grade_subject_year` unique constraint for multi-user safety

## Links

- [#219](https://github.com/jaetill/ai-teacher/issues/219) — IDOR bug report
- [#217](https://github.com/jaetill/ai-teacher/pull/217) — Prior PR adding authentication to `GET /api/courses`
- [PR #220](https://github.com/jaetill/ai-teacher/pull/220) — Implementation PR
