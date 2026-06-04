# ADR-0021: Close IDOR — scope Drive/materials queries to authenticated user

- **Status:** Proposed
- **Date:** 2026-06-04
- **Deciders:** Jason
- **Tags:** api-contract, security, database, multi-tenancy

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

Issue #121 identified an IDOR (Insecure Direct Object Reference) vulnerability: several API routes queried `drive_folders` and `materials` without scoping to the authenticated user. Three routes (`/api/import/build-curriculum`, `/api/curriculum/save`, `/api/year-plan/save`) lacked authentication checks entirely. The remaining Drive-related routes (`drive/setup`, `drive/import`, `upload/file`, `upload/check-duplicates`) verified an access token but did not filter DB results by user identity, meaning User A could read or write User B's folders and materials.

How should we isolate per-user data in these routes while maintaining backward compatibility with existing single-tenant rows?

## Decision Drivers

- **Security.** OWASP A01:2021 (Broken Access Control). An IDOR allowing cross-user data access is a critical finding that must be closed before additional users onboard.
- **API contract stability.** Callers currently expect 200 responses from these routes without an email-bearing session. Adding 401 responses is a breaking behavioral change that must be documented.
- **Multi-tenant readiness.** The system is moving from single-teacher use toward a small teaching community. Data isolation must be structurally enforced, not assumed by convention.
- **Migration safety.** Existing rows in `drive_folders` and `materials` were created without an `owner_email` value. The migration must not break existing data or require a backfill before the app functions.

## Considered Options

- **Option A:** Row-level owner scoping via `owner_email` column (chosen)
- **Option B:** PostgreSQL Row-Level Security (RLS) policies
- **Option C:** Tenant-ID foreign key to a `users` table

## Decision Outcome

Chosen option: **Option A — row-level owner scoping via `owner_email`**, because it closes the IDOR with minimal schema and code changes, requires no new tables or Postgres-level policy configuration, and can be deployed immediately without a data backfill. The `owner_email` column is nullable, preserving backward compatibility with pre-existing single-tenant rows.

This is a **breaking API contract change**: three routes that previously accepted unauthenticated requests now return 401, and all affected routes return only the authenticated user's data instead of all data.

## Consequences

### Positive

- **IDOR closed.** Every read and write path for `drive_folders` and `materials` is scoped to the session user's email. Cross-user data leakage is no longer possible through these endpoints.
- **Auth coverage expanded.** `build-curriculum`, `curriculum/save`, and `year-plan/save` now require authentication where they previously had none.
- **Multi-tenant data isolation.** The `(folder_key, owner_email)` composite unique constraint structurally prevents folder-key collisions between users, enabling safe multi-user operation.
- **Shared helper.** `getUserEmail()` in `src/lib/auth-helpers.ts` provides a consistent auth extraction pattern for routes that use `getServerSession` directly.

### Negative

- **Breaking 401 behavior.** Clients calling `curriculum/save`, `year-plan/save`, or `build-curriculum` without a valid session will now receive 401 instead of proceeding. Any automation or testing that relied on unauthenticated access must be updated.
- **Nullable `owner_email`.** Existing rows have `owner_email = NULL`. Queries using `eq(ownerEmail, userEmail)` will not match these legacy rows until they are backfilled. This is acceptable for a single-teacher deployment with a fresh Drive setup but would cause data loss in a multi-tenant migration without a backfill step.
- **Email as identifier.** Using the session email directly (rather than an opaque user ID) couples data isolation to the email claim from the OAuth provider. If a user changes their email, their data becomes orphaned.

### Neutral

- **No RLS.** Row-Level Security was considered but deferred. The current approach relies on application-level query scoping, which is consistent with the existing codebase pattern. RLS can be adopted later if the surface area of user-scoped queries grows significantly.
- **No backfill migration.** Existing `NULL` rows are not retroactively stamped with an owner. This is a known gap; a backfill script or migration will be needed before a second user is onboarded.

## Pros and Cons of the Options

### Option A: Row-level owner scoping via `owner_email` column

- ✅ Pro: Minimal schema change — one nullable column per table, one migration.
- ✅ Pro: Query changes are local to each route — no framework-level middleware or Postgres config needed.
- ✅ Pro: Immediately deployable; nullable column avoids breaking existing data.
- ✅ Pro: Easy to audit — `grep ownerEmail` finds every scoped query.
- ❌ Con: Relies on developers remembering to add the filter to every new query. No structural enforcement at the DB layer.
- ❌ Con: Email-as-key is fragile if users change email addresses.
- ❌ Con: Legacy NULL rows invisible to new scoped queries without backfill.

### Option B: PostgreSQL Row-Level Security (RLS) policies

- ✅ Pro: Structural enforcement — impossible to forget the filter; DB rejects unscoped queries.
- ✅ Pro: Works across all query paths including raw SQL, migrations, and ad-hoc tooling.
- ❌ Con: Requires `SET LOCAL` or a session variable on every DB connection to pass user context. Drizzle ORM does not natively support this; would need custom connection middleware.
- ❌ Con: Significantly more complex to set up, test, and debug.
- ❌ Con: Overkill for the current scale (one teacher, small community).

### Option C: Tenant-ID foreign key to a `users` table

- ✅ Pro: Proper relational modeling; user identity is a first-class entity.
- ✅ Pro: Decouples data ownership from email (survives email changes).
- ❌ Con: Requires a `users` table that does not yet exist — auth is NextAuth session-based with no local user record.
- ❌ Con: Larger migration scope; every route would need to resolve email → user ID before querying.
- ❌ Con: Premature for current single-user reality; can be adopted later when a `users` table is introduced.

## Implementation notes

- **Migration:** `drizzle/0005_chemical_ser_duncan.sql` — adds `owner_email` (nullable text) to `drive_folders` and `materials`, creates `idx_drive_folders_owner` index, replaces `uq_drive_folders_key` with `uq_drive_folders_key_owner` composite unique.
- **Schema files:** `src/db/schema/drive-folders.ts`, `src/db/schema/materials.ts` — Drizzle schema definitions updated.
- **Auth helper:** `src/lib/auth-helpers.ts` — `getUserEmail()` extracts `session.user.email` via `getServerSession`.
- **Affected routes (auth guard added):** `api/curriculum/save`, `api/year-plan/save`, `api/import/build-curriculum`.
- **Affected routes (queries scoped):** `api/drive/setup`, `api/drive/import`, `api/upload/file`, `api/upload/check-duplicates`, `api/import/build-curriculum`.
- **Known follow-up:** Backfill existing NULL `owner_email` rows before onboarding a second user. Consider migrating to a `user_id` FK when a `users` table is introduced.

## Links

- [OWASP A01:2021 — Broken Access Control](https://owasp.org/Top10/A01_2021-Broken_Access_Control/) — the vulnerability class this ADR addresses.
- [GitHub Issue #121](https://github.com/jaetill/ai-teacher/issues/121) — IDOR report that triggered this change.
- [PR #131](https://github.com/jaetill/ai-teacher/pull/131) — implementation.
