# ADR-0021: Course ownership via `owner_email` column

- **Status:** Proposed
- **Date:** 2026-06-13
- **Deciders:** Jason
- **Tags:** schema, security, multi-user

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

The `courses` table has no ownership column. Any authenticated user can call `POST /api/import/build-curriculum` with a grade value and the "find or create course" SELECT returns the first matching row regardless of who owns it. This is an IDOR vulnerability: User B can silently attach AI-generated units, lessons, and standards to User A's course if both share the same grade.

How should we associate courses with their owning user so that queries are scoped per-user and future multi-user scenarios are safe by default?

## Decision Drivers

- **Security.** The IDOR must be closed before a second account is onboarded; any solution must scope reads and writes to the authenticated user.
- **Minimal migration risk.** The app is live on Vercel with existing seeded data. The migration must not break the running system or require downtime.
- **Auth model alignment.** Google OAuth via NextAuth is the current auth provider; the session exposes `user.email` as the stable identity claim.
- **Simplicity.** The app targets a single teacher today with potential sharing to a small community. The ownership model should be the simplest thing that closes the vulnerability without over-engineering for hypothetical role hierarchies.

## Considered Options

- **Option A:** Nullable `owner_email` text column on `courses`, scoped queries by email
- **Option B:** Non-nullable `owner_id` UUID foreign key to a `users` table
- **Option C:** Row-level security (RLS) policy in PostgreSQL

## Decision Outcome

Chosen option: **Option A — nullable `owner_email` text column**, because it closes the IDOR with a single-column migration, aligns with the session's email claim without requiring a `users` table that does not yet exist, and allows a zero-downtime deploy since existing rows remain valid with `NULL`.

## Consequences

### Positive

- **IDOR closed.** Course SELECTs in `build-curriculum` (and any future route) filter by `owner_email`, preventing cross-user data access.
- **Zero-downtime migration.** The column is nullable, so the `ALTER TABLE ADD COLUMN` does not rewrite existing rows or require a backfill before deploy.
- **No new tables.** Avoids introducing a `users` table and foreign-key lifecycle management before the auth story is settled.
- **Index supports scoped queries.** The `idx_courses_owner_email` btree index keeps ownership-filtered SELECTs efficient as the table grows.

### Negative

- **Denormalized identity.** Email is stored as a raw string, not a foreign key. If the user changes their Google email or the app migrates to a different identity provider, a data migration is needed.
- **Legacy rows invisible.** Courses created before this migration have `owner_email = NULL` and will not appear in scoped queries. A manual backfill (`UPDATE courses SET owner_email = '...'`) is required before a second account is onboarded.
- **No cascading referential integrity.** Without a `users` table and foreign key, the database cannot enforce that `owner_email` corresponds to a real account.

### Neutral

- **Future `users` table migration.** When a `users` table is introduced (likely for multi-user features), `owner_email` can be replaced with a `owner_id` FK and backfilled from the email values. This ADR does not block that path.
- **Column applies to `courses` only.** Other tables (`units`, `lessons`, etc.) inherit ownership transitively through their `course_id` foreign key. No additional ownership columns are needed on child tables today.

## Pros and Cons of the Options

### Option A: Nullable `owner_email` text column

- ✅ Pro: Single-column migration; no schema dependencies on tables that don't exist yet.
- ✅ Pro: Directly uses the session's email claim — no join or lookup required.
- ✅ Pro: Nullable means zero-downtime deploy; existing data unaffected.
- ✅ Pro: Closes the IDOR immediately with minimal code change.
- ❌ Con: Denormalized; email stored as raw text, not a FK.
- ❌ Con: Legacy rows with `NULL` require manual backfill.

### Option B: Non-nullable `owner_id` UUID FK to `users` table

- ✅ Pro: Normalized; referential integrity enforced by the database.
- ✅ Pro: Decouples ownership from email provider.
- ❌ Con: Requires creating a `users` table first — the auth model (Cognito vs NextAuth) is still TBD per CLAUDE.md.
- ❌ Con: Existing rows must be backfilled before the migration can run (non-nullable constraint).
- ❌ Con: Adds a JOIN to every ownership-scoped query.
- ❌ Con: Over-engineers for the current single-user reality.

### Option C: Row-level security (RLS) in PostgreSQL

- ✅ Pro: Transparent enforcement — application code cannot bypass ownership scoping.
- ✅ Pro: No application-level query changes needed once policies are in place.
- ❌ Con: Requires `SET ROLE` or session-variable injection on every connection — complex with Neon's connection pooler.
- ❌ Con: Drizzle ORM has limited RLS support; debugging query failures becomes harder.
- ❌ Con: Significant operational complexity for a single-teacher app.

## Implementation notes

- **Migration:** `drizzle/0005_add_owner_email_to_courses.sql` — `ALTER TABLE courses ADD COLUMN owner_email text` + btree index.
- **Schema:** `src/db/schema/courses.ts` — `ownerEmail: text("owner_email")` added to the Drizzle table definition.
- **Auth helper:** `src/lib/auth-helpers.ts` — `requireEmail(session)` extracts `session.user.email` consistently across routes.
- **Route fix:** `src/app/api/import/build-curriculum/route.ts` — course SELECT scoped by `eq(courses.ownerEmail, email)`; INSERT sets `ownerEmail: email`.
- **Backfill required:** Before onboarding a second user, run: `UPDATE courses SET owner_email = '<primary-teacher-email>' WHERE owner_email IS NULL`.

## Links

- [OWASP IDOR](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/05-Authorization_Testing/04-Testing_for_Insecure_Direct_Object_References) — the vulnerability class this change addresses.
- GitHub issue #216 — the bug report that triggered this fix.
- PR #203 — related PR that also adds `ownerEmail` for `units/[id]` and `year-plan/save` routes.
