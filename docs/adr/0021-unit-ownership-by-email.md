# ADR-0021: Unit ownership via `owner_email` column

- **Status:** Proposed
- **Date:** 2026-06-11
- **Deciders:** Jason
- **Tags:** schema, security, auth

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

The `POST /api/units/[id]/notes` route accepted any unit ID and wrote to it without authentication or ownership checks. This is a textbook IDOR (Insecure Direct Object Reference) vulnerability: any caller who can guess or enumerate unit IDs can overwrite another teacher's notes.

How should we track which teacher owns a unit so that write operations can be scoped to the owner?

## Decision Drivers

- **No users table exists.** The app uses NextAuth sessions but has no `users` table or stable internal user ID. The session's `user.email` is the only reliable identity anchor available today.
- **Single-teacher MVP.** The current deployment serves one teacher. The ownership model should be simple enough to ship immediately while remaining extensible for future multi-user scenarios.
- **Non-breaking migration.** Existing rows in `units` were created before ownership tracking. The migration must not require a data backfill or break existing reads.
- **IDOR remediation urgency.** Issue #171 flagged this as a security defect. The fix should be minimal and self-contained.

## Considered Options

- **Option A:** Add a nullable `owner_email` text column to `units`
- **Option B:** Create a `users` table and add an `owner_id` UUID FK to `units`
- **Option C:** Separate `unit_permissions` join table (RBAC model)

## Decision Outcome

Chosen option: **Option A — nullable `owner_email` text column**, because it closes the IDOR vulnerability with a single-column migration, requires no new tables, and matches the identity primitive (`session.user.email`) already available from NextAuth. When a `users` table is introduced later, a follow-up migration can add an `owner_id` FK and backfill from `owner_email`.

## Consequences

### Positive

- **IDOR closed.** Write routes can scope their `WHERE` clause to `AND owner_email = :sessionEmail`, preventing cross-user mutation. The notes route is the first to adopt this pattern.
- **Zero-downtime migration.** `ALTER TABLE "units" ADD COLUMN "owner_email" text` is a nullable add — no table rewrite, no lock escalation on PostgreSQL, no backfill required.
- **No new tables or joins.** Ownership is resolved by a column comparison, not a join, keeping query plans simple.

### Negative

- **Email as identity is denormalized.** If a teacher changes their email in the auth provider, their ownership links break. Acceptable for the single-teacher MVP; a `users` table with stable IDs will resolve this.
- **No index on `owner_email`.** Queries scoped by `(id, owner_email)` use the primary key index on `id`; the `owner_email` predicate filters a single row. An index would only matter for queries like "all units owned by X," which don't exist yet.
- **Existing rows have NULL `owner_email`.** Until a backfill assigns ownership, legacy units are invisible to owner-scoped writes (the `AND owner_email = :email` predicate won't match NULL). This is the safe default — it's better to deny writes to un-owned rows than to allow them.

### Neutral

- **Pattern must be adopted route-by-route.** Other write routes (lessons, assessments, courses) don't yet enforce ownership. Each will need the same session check and WHERE-clause scoping as they are hardened. This ADR establishes the column; each route adoption is mechanical.
- **Read routes are unchanged.** This ADR does not gate reads on ownership. Read-side access control is a separate concern if/when the app serves multiple teachers.

## Pros and Cons of the Options

### Option A: Nullable `owner_email` text column on `units`

- ✅ Pro: Single-column migration — smallest possible schema change.
- ✅ Pro: Matches the identity primitive NextAuth already provides (`session.user.email`).
- ✅ Pro: No new tables, no FK constraints, no join overhead.
- ✅ Pro: Ships immediately — closes the IDOR with one PR.
- ❌ Con: Denormalized — email changes break ownership links.
- ❌ Con: Not extensible to role-based sharing without additional schema work.

### Option B: `users` table + `owner_id` UUID FK

- ✅ Pro: Normalized — stable internal ID survives email changes.
- ✅ Pro: Foundation for richer user profiles (preferences, roles).
- ❌ Con: Requires creating a `users` table, a migration to populate it from session data, and a second migration to add the FK to `units` — significantly larger scope.
- ❌ Con: NextAuth session doesn't carry a stable user ID today; would need a session callback or adapter change.
- ❌ Con: Over-engineered for a single-teacher MVP addressing an urgent security fix.

### Option C: `unit_permissions` join table (RBAC)

- ✅ Pro: Supports multiple roles (owner, editor, viewer) and shared access.
- ❌ Con: Requires two new tables (`users` + `unit_permissions`) and join-based authorization logic.
- ❌ Con: No current requirement for shared access or roles.
- ❌ Con: Dramatically increases scope for an urgent security fix.

## Implementation notes

- **Migration:** `drizzle/0005_unit_owner_email.sql` — `ALTER TABLE "units" ADD COLUMN "owner_email" text;`
- **Schema:** `src/db/schema/units.ts` — `ownerEmail: text("owner_email")` added to the `units` table definition.
- **Route hardened:** `src/app/api/units/[id]/notes/route.ts` — now calls `getServerSession(authOptions)`, returns 401 if unauthenticated, and scopes the UPDATE's WHERE clause to `and(eq(units.id, id), eq(units.ownerEmail, userEmail))`.
- **Test coverage:** `tests/api/units-id-notes.test.ts` — verifies 401 for unauthenticated requests, 404 for non-owned units, and asserts the WHERE clause includes the owner email predicate (preventing silent regression to the un-scoped query).
- **Follow-up needed:** New units must be created with `ownerEmail` set to the session email. Existing creation routes should be updated in a follow-up PR.

## Links

- [OWASP IDOR](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/) — the vulnerability class this ADR addresses.
- [GitHub Issue #171](https://github.com/jaetill/ai-teacher/issues/171) — the security report that triggered this change.
- [ADR-0001](0001-platform-adoption.md) — platform adoption; notes auth is TBD (NextAuth path).
