# ADR-0021: Course ownership — `owner_email` column on `courses` table

- **Status:** Proposed
- **Date:** 2026-06-15
- **Deciders:** Jason
- **Tags:** schema, security, authorization

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

`GET /api/curriculum/editor/data` returned the full curriculum tree (units, lessons, assessments, Drive URLs) for any course UUID, regardless of who was asking. The route had no session check and no row-level ownership predicate — authentication without authorization (IDOR, issue #232).

How should we represent course ownership in the database so that API routes can enforce per-user access control on course data?

## Decision Drivers

- **Security.** The IDOR is an active vulnerability; the fix must ship without waiting for a full users-table migration.
- **Single-teacher deployment.** ai-teacher currently serves one teacher. The ownership model needs to be correct for multi-user but does not need to be optimized for scale yet.
- **Auth stack.** NextAuth with Google provider is the current auth layer. The session exposes `user.email` as the stable identity claim.
- **Backward compatibility.** Existing course rows have no ownership data. The migration must not break the running app before a backfill is applied.
- **Schema evolution.** A future `users` table is likely (CLAUDE.md: "Auth: TBD"). The ownership column should be replaceable with a foreign key without a rewrite.

## Considered Options

- **Option A:** Add a nullable `owner_email text` column to `courses`, filter queries by session email
- **Option B:** Create a `users` table now, add `owner_id uuid` FK to `courses`
- **Option C:** No schema change — enforce ownership in application middleware via a session-to-course mapping table or external policy

## Decision Outcome

Chosen option: **Option A — nullable `owner_email` text column**, because it closes the IDOR immediately with a single-column migration while remaining compatible with a future FK migration when a `users` table lands.

## Consequences

### Positive

- **IDOR closed.** API routes can scope queries with `eq(courses.ownerEmail, userEmail)`, preventing cross-user data access.
- **Zero-downtime migration.** `ALTER TABLE ADD COLUMN` with no `NOT NULL` constraint is non-blocking on PostgreSQL. Existing rows get `NULL` and remain queryable until backfilled.
- **Minimal schema footprint.** One column, one migration file. No new tables, no new indexes required for the current single-teacher workload.

### Negative

- **Denormalized identity.** Email is duplicated across course rows rather than normalized into a users table with a UUID FK. If a teacher changes their Google account email, all course rows must be updated.
- **Backfill required.** Existing courses return 404 until `owner_email` is populated. For the single-teacher deployment this is a one-time manual `UPDATE`, but it is an operational step outside the migration.
- **No index on `owner_email`.** Acceptable for a single-teacher workload, but multi-teacher scaling will need `CREATE INDEX idx_courses_owner_email ON courses(owner_email)`.

### Neutral

- **Column is nullable.** This is intentional for backward compatibility, not a permanent design. When a `users` table is introduced and all rows are backfilled, the column (or its FK replacement) can be made `NOT NULL`.
- **Email as identity claim.** Google OAuth `email` is stable and verified for Google Workspace accounts. For consumer Gmail accounts, email can technically change, but this matches NextAuth's session model and is the standard practice for Google-provider apps.

## Pros and Cons of the Options

### Option A: Nullable `owner_email` text column

- ✅ Pro: Ships immediately — one migration, one code change, closes the IDOR today.
- ✅ Pro: Uses the same identity claim (`email`) already present in the NextAuth session, no join needed.
- ✅ Pro: Easy to replace later — when a `users` table lands, add `owner_id uuid REFERENCES users(id)`, backfill from `owner_email`, drop the text column.
- ❌ Con: Denormalized — email duplication across rows.
- ❌ Con: Fragile if email changes (mitigated: Google Workspace emails are stable).

### Option B: Create `users` table now, add `owner_id` FK

- ✅ Pro: Normalized from day one — single source of truth for user identity.
- ✅ Pro: FK constraint enforces referential integrity.
- ❌ Con: Requires designing the `users` table schema before the auth story is settled (CLAUDE.md: "Auth: TBD — Cognito or NextAuth").
- ❌ Con: Two migrations, a new table, and upsert-on-login logic — significantly more work for a security fix.
- ❌ Con: Premature commitment to a schema that may change when the auth decision is made.

### Option C: No schema change — application-layer enforcement

- ✅ Pro: No migration, no schema change.
- ❌ Con: Ownership mapping must live somewhere (middleware, external policy, separate table) — just moves the schema problem.
- ❌ Con: No database-level guarantee that queries are scoped — every route must remember to apply the filter, with no column to filter on.
- ❌ Con: Harder to audit — ownership is implicit rather than explicit in the data model.

## Implementation notes

- **Migration:** `drizzle/0005_easy_blur.sql` — `ALTER TABLE "courses" ADD COLUMN "owner_email" text;`
- **Schema:** `src/db/schema/courses.ts` — `ownerEmail: text("owner_email")`
- **API route hardened:** `src/app/api/curriculum/editor/data/route.ts` — session guard + `and(eq(courses.id, courseId), eq(courses.ownerEmail, userEmail))` predicate
- **Backfill (manual, post-deploy):** `UPDATE courses SET owner_email = '<teacher-email>' WHERE owner_email IS NULL;`
- **Follow-up:** When a `users` table is introduced, migrate `owner_email` to `owner_id uuid REFERENCES users(id)` and drop the text column.

## Links

- [OWASP IDOR](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/05-Authorization_Testing/04-Testing_for_Insecure_Direct_Object_References) — the vulnerability class this addresses.
- [Issue #232](https://github.com/jaetill/ai-teacher/issues/232) — the IDOR report.
- [ADR-0001](0001-platform-adoption.md) — platform adoption; notes auth is TBD.
