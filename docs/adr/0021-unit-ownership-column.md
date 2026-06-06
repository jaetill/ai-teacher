# ADR-0021: Add `user_id` ownership column to units table

- **Status:** Proposed
- **Date:** 2026-06-06
- **Deciders:** Jason
- **Tags:** schema, auth, security

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

The `infer-standards` API route (`POST /api/units/[id]/infer-standards`) was unprotected — any caller could trigger AI-powered standard inference on any unit. Issue #117 flagged this as a security gap. Fixing it requires two things: (1) the route must require authentication, and (2) it must enforce that only the unit's owner can trigger the operation.

The second requirement surfaces a schema question: units currently have no ownership column. How should the system record which user owns a unit, and how should API routes enforce that relationship?

## Decision Drivers

- **Security obligation.** Authenticated routes that mutate or trigger expensive operations (AI inference, DB writes) on a resource must verify the caller owns that resource. This is OWASP Broken Object-Level Authorization (BOLA/IDOR).
- **Incremental adoption.** The app already has units in production with no owner. A migration that blocks on backfilling every row would be disruptive.
- **Single-user reality.** The current deployment serves one teacher. Multi-tenancy is anticipated but not required today; the solution should not over-engineer for a user-management system that does not yet exist.
- **Auth stack.** NextAuth (Google provider) is already integrated. `session.user.id` (sourced from `token.sub`) is the available identifier.

## Considered Options

- **Option A:** Nullable `text` column `user_id` on `units` — ownership enforced only when the column is populated
- **Option B:** Non-nullable `user_id` with a backfill migration setting all existing rows to a known seed user
- **Option C:** Separate `unit_ownership` join table mapping `unit_id` to `user_id`

## Decision Outcome

Chosen option: **Option A — nullable `user_id` text column**, because it introduces ownership semantics without requiring a data backfill or breaking existing units. Routes check ownership conditionally: if `user_id` is `null`, the unit is treated as unowned (legacy) and accessible to any authenticated user; if `user_id` is set, only the matching user may operate on it.

## Consequences

### Positive

- **Closes BOLA gap on `infer-standards`.** The route now requires a session and verifies ownership before triggering AI inference. The same pattern is ready for other unit-scoped routes.
- **Zero-downtime migration.** `ALTER TABLE "units" ADD COLUMN "user_id" text` is a nullable-add — no table rewrite, no lock contention, no backfill step.
- **Forward-compatible.** When multi-user support is built, new units will be created with `user_id` set. The nullable column becomes a natural migration boundary: legacy rows can be backfilled or archived at that time.

### Negative

- **No foreign key constraint.** `user_id` is a plain `text` column, not a reference to a `users` table (which does not yet exist). Referential integrity is enforced only at the application layer. When a `users` table is introduced, a follow-up migration should add the FK.
- **Nullable column means split logic.** Every ownership check must handle the `user_id IS NULL` case. Until legacy units are backfilled, two code paths exist: "unowned, allow any authenticated user" vs. "owned, enforce match." This is a small but real maintenance cost.
- **No index on `user_id`.** Queries filtering by owner will table-scan. Acceptable at current scale (single teacher, small unit count); an index should be added when the user base grows.

### Neutral

- **`session.user` type declaration extended.** `next-auth.d.ts` now declares `user.id` on the `Session` interface and `auth.ts` populates it from `token.sub`. This is a TypeScript-only change that surfaces an already-available value; it has no runtime cost and aligns the type with NextAuth's actual behavior.
- **Ownership guard pattern not yet applied to other unit routes.** `GET /api/units/[id]`, `link-materials`, and other unit-scoped routes still check only authentication, not ownership. Extending the pattern is incremental and should follow the same conditional-null approach.

## Pros and Cons of the Options

### Option A: Nullable `user_id` text column (chosen)

- Pro: No backfill required — migration is a single `ALTER TABLE ADD COLUMN`
- Pro: Existing units remain accessible; no data loss or access disruption
- Pro: Minimal schema change — one column, one migration file
- Con: No FK constraint until a `users` table exists
- Con: Nullable ownership creates two code paths in access checks

### Option B: Non-nullable `user_id` with backfill

- Pro: Clean, consistent ownership — every unit has an owner from day one
- Pro: Simpler access-check logic (no null branch)
- Con: Requires identifying a "seed user" ID for existing rows — fragile if the auth provider changes or multiple users are added
- Con: Migration must backfill in a transaction; riskier for production data
- Con: Over-commits to a user-identity format before the `users` table design is settled

### Option C: Separate `unit_ownership` join table

- Pro: Supports future many-to-many (shared units, team ownership) without schema change
- Pro: Clean separation of concerns — ownership is its own entity
- Con: Over-engineered for current single-owner semantics
- Con: Every ownership check becomes a JOIN, adding query complexity
- Con: Requires a new table, new schema definition, and new migration — higher surface area for a single-user app

## Implementation notes

- Migration: `drizzle/0005_add_user_id_to_units.sql` — `ALTER TABLE "units" ADD COLUMN "user_id" text`
- Schema: `src/db/schema/units.ts` — `userId: text("user_id")`
- Auth: `src/lib/auth.ts` — exposes `token.sub` as `session.user.id`
- Type: `src/types/next-auth.d.ts` — declares `user.id` on `Session`
- Guard: `src/app/api/units/[id]/infer-standards/route.ts` — auth + ownership check
- Tests: `tests/api/units-infer-standards.test.ts` — 401/403 cases

## Links

- [OWASP BOLA](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/) — the vulnerability class this addresses
- [Drizzle ORM migrations](https://orm.drizzle.team/docs/migrations) — migration tooling used
- Issue #117 — the security report that triggered this work
