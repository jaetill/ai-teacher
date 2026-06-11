# ADR-0021: Course Ownership via `owner_email` Column

- **Status:** Proposed
- **Date:** 2026-06-11
- **Deciders:** Jason
- **Tags:** schema, security, authorization

> Format: MADR 4.x (single-decision form). See [`template.md`](template.md).

## Context and Problem Statement

The `courses` table has no ownership column. Every authenticated user can access every course and its child units via `GET /api/units/[id]`, creating an insecure direct object reference (IDOR) vulnerability (issue #154). The application needs a way to scope data access to the teacher who owns a course.

How should course ownership be represented in the schema, and how should the transition from the current open-access state be handled?

## Decision Drivers

- **IDOR fix urgency.** Issue #154 is a security finding; the ownership column must ship before multi-user access is possible.
- **Auth is session-email-based.** NextAuth sessions expose `user.email` as the stable identifier today; no internal user-ID table exists yet.
- **Backward compatibility.** Existing courses in production have no owner. The migration must not break read access for the current single-user deployment.
- **Simplicity.** The app serves one teacher now with potential growth to a small community; the ownership model should be minimal and evolvable.

## Considered Options

- **Option A: Add nullable `owner_email` text column to `courses`** — use the session email directly as the ownership key; NULL means unclaimed (legacy).
- **Option B: Add `owner_id` UUID FK to a new `users` table** — create a `users` table, populate it from NextAuth sessions, and reference it from `courses`.
- **Option C: Row-Level Security (RLS) in PostgreSQL** — use Postgres RLS policies with `SET LOCAL role` per request instead of application-level WHERE clauses.

## Decision Outcome

Chosen option: **Option A — nullable `owner_email` text column**, because it resolves the IDOR with a single migration and no new tables, aligning with the current auth surface (session email). The nullable design provides a safe migration path for existing unclaimed courses.

## Consequences

### Positive

- **IDOR resolved.** `GET /api/units/[id]` now joins through `courses` and filters on `owner_email = session.email OR owner_email IS NULL`, returning 404 for unauthorized access without revealing UUID existence.
- **Zero-downtime migration.** The column is nullable with no default, so `ALTER TABLE` is instant on Postgres (no table rewrite). Existing courses remain accessible to all authenticated users until a backfill assigns owners.
- **Index supports multi-user queries.** `idx_courses_owner_email` ensures ownership lookups stay fast as the course table grows.

### Negative

- **Email as FK is denormalized.** If a teacher's email changes, all their courses become orphaned until updated. A future `users` table with a stable ID would avoid this.
- **Backfill needed.** Legacy courses with `NULL owner_email` are accessible to any authenticated user — acceptable for a single-teacher deployment but must be backfilled before enabling multi-user access.
- **Partial coverage.** Only `GET /api/units/[id]` is scoped in this PR. Other endpoints that read or mutate courses/units/lessons need the same ownership check applied incrementally.

### Neutral

- **No new tables.** The decision intentionally avoids introducing a `users` table. When NextAuth + a proper user model is adopted, `owner_email` can be migrated to a `owner_id` FK via a data migration and the text column dropped.

## Pros and Cons of the Options

### Option A: Nullable `owner_email` text column (chosen)

- ✅ Pro: Single migration, no new tables, ships immediately.
- ✅ Pro: Aligns directly with the session identifier (`user.email`).
- ✅ Pro: NULL semantics provide a clean legacy-data migration path.
- ❌ Con: Email is not a stable long-term identifier; rename/change requires a data update.
- ❌ Con: No referential integrity (no FK constraint to a users table).

### Option B: `owner_id` UUID FK to a `users` table

- ✅ Pro: Stable identifier decoupled from email; proper FK constraint.
- ✅ Pro: Future-proof for multi-user features (roles, sharing, team ownership).
- ❌ Con: Requires creating and populating a `users` table — larger migration surface.
- ❌ Con: Auth system (NextAuth) is TBD; building a users table now couples to an unfinished design.
- ❌ Con: Slower to ship for a security fix.

### Option C: PostgreSQL Row-Level Security

- ✅ Pro: Enforcement at the database layer; cannot be bypassed by application bugs.
- ✅ Pro: No application-level WHERE clause changes needed.
- ❌ Con: Requires `SET LOCAL role`/`SET LOCAL` session variables per request — non-trivial with connection pooling (Neon serverless driver).
- ❌ Con: Harder to test and debug; RLS policy errors surface as empty result sets with no application-level diagnostics.
- ❌ Con: Overkill for a single-teacher app that may never need row-level database policies.

## Implementation notes

- **Migration:** [`drizzle/0005_add_owner_email_to_courses.sql`](../../drizzle/0005_add_owner_email_to_courses.sql) — `ALTER TABLE` + btree index.
- **Schema:** [`src/db/schema/courses.ts`](../../src/db/schema/courses.ts) — `ownerEmail` field added to the Drizzle table definition.
- **Route scoped:** [`src/app/api/units/[id]/route.ts`](../../src/app/api/units/[id]/route.ts) — ownership WHERE clause added to the unit GET handler.
- **Follow-up required:** Apply the same ownership scoping to all other course/unit/lesson endpoints. Track via a follow-up issue.
- **Backfill required:** Before enabling multi-user access, run a one-time UPDATE to set `owner_email` on all existing courses with NULL values.

## Links

- [Issue #154](https://github.com/jaetill/ai-teacher/issues/154) — IDOR vulnerability report that motivated this change.
- [OWASP IDOR](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/) — Broken Object Level Authorization (API1:2023).
