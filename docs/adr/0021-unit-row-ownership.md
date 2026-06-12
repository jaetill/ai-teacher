# ADR-0021: Row-Level Ownership on Units via `owner_email`

- **Status:** Proposed
- **Date:** 2026-06-12
- **Deciders:** Jason
- **Tags:** schema, security, auth

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

Several API routes that mutate unit data (e.g. `POST /api/units/[id]/notes`) accept a unit ID from the client but do not verify that the requesting user owns the targeted unit. In a single-teacher deployment this is benign, but as the app moves toward multi-user auth (NextAuth is now live), any authenticated user can write to any unit. How should we scope unit mutations to the owning teacher?

## Decision Drivers

- **Security.** Authenticated users must not be able to mutate units they did not create. This is a prerequisite before exposing the app to additional users.
- **Incremental rollout.** The ownership column must be additive — existing units (created before auth existed) must continue to work without a data backfill.
- **Auth model alignment.** NextAuth sessions expose `session.user.email` as the stable identity claim; whatever ownership key we pick should align with what auth already provides.
- **Simplicity.** The app has one table that needs ownership gating today (`units`). The mechanism should be simple enough to extend to other tables later without over-engineering now.

## Considered Options

- **Option A: `owner_email` text column** — Store the session email directly on the row; scope mutations with `WHERE owner_email = session.user.email`.
- **Option B: `owner_id` UUID FK to a `users` table** — Create a `users` table, populate it from NextAuth callbacks, reference via FK.
- **Option C: Application-level guard only** — No schema change; check ownership in API route logic by joining through `courses` or another relation.

## Decision Outcome

Chosen option: **Option A — `owner_email` text column**, because it requires no new tables, aligns directly with the identity claim NextAuth already exposes, and can be added as a nullable column with zero disruption to existing data.

## Consequences

### Positive

- **Immediate security fix.** Write routes can add `AND owner_email = ?` to their WHERE clauses, closing the open-mutation vulnerability.
- **Zero-downtime migration.** The column is nullable; existing rows keep `NULL` and remain accessible to any authenticated user until a backfill is performed.
- **No new tables.** Avoids introducing a `users` table before one is actually needed for other features.

### Negative

- **Email as key.** If a teacher's email address changes, their owned units become orphaned. Acceptable for now — the app has one user — but a future `users` table migration will need to re-key ownership.
- **No FK constraint.** `owner_email` is a bare text column with no referential integrity. Typos or stale emails cannot be caught at the database level.
- **NULL means "unowned."** Pre-existing units with `NULL` owner_email are effectively world-writable among authenticated users until backfilled.

### Neutral

- **Pattern is portable.** The same `owner_email` column can be added to `lessons`, `courses`, or other tables if needed, using the same migration pattern.
- **Backfill is deferred, not forgotten.** A follow-up task should backfill existing units (likely via a one-shot script querying git/session history or assigning all to the known single teacher).

## Pros and Cons of the Options

### Option A: `owner_email` text column (chosen)

- ✅ Pro: Single `ALTER TABLE ADD COLUMN` — minimal migration risk.
- ✅ Pro: Matches `session.user.email` directly — no joins needed for the ownership check.
- ✅ Pro: Nullable means zero disruption to existing rows.
- ❌ Con: No referential integrity on the email value.
- ❌ Con: Ownership breaks if a user's email changes.

### Option B: `owner_id` UUID FK to a `users` table

- ✅ Pro: Proper FK constraint; ownership survives email changes.
- ✅ Pro: Sets up a `users` table that other features (preferences, roles) will eventually need.
- ❌ Con: Requires creating a `users` table and populating it from NextAuth callbacks — significant scope increase for a security hotfix.
- ❌ Con: Every ownership check requires a join or subquery through the `users` table.
- ❌ Con: Existing rows need a backfill to a user ID that may not exist yet.

### Option C: Application-level guard only

- ✅ Pro: No schema change at all.
- ❌ Con: Ownership must be inferred through relations (e.g. course → creator), which don't currently exist.
- ❌ Con: Guard logic is scattered across every mutation route with no single source of truth.
- ❌ Con: A missed route means an open vulnerability — no defense-in-depth from the schema.

## Implementation notes

- **Migration:** `drizzle/0005_unit_owner_email.sql` — `ALTER TABLE "units" ADD COLUMN "owner_email" text;`
- **Schema:** `src/db/schema/units.ts` — `ownerEmail: text("owner_email")`
- **Write routes updated:** `src/app/api/import/build-curriculum/route.ts` and `src/app/api/year-plan/save/route.ts` now set `ownerEmail: userEmail` on every unit INSERT.
- **Auth tightened:** `year-plan/save` route gains a `getServerSession` guard (was previously unauthenticated); `build-curriculum` route tightens its existing guard to also require `session.user.email`.
- **Pending:** Read/mutation routes (e.g. `POST /api/units/[id]/notes`) should add `AND owner_email = session.user.email` to their WHERE clauses (tracked in PR #209).
- **Backfill:** Existing NULL-owned units should be backfilled to the single known teacher email in a follow-up migration once the deployment is confirmed stable.

## Links

- [PR #212](https://github.com/jaetill/ai-teacher/pull/212) — implements this ADR (migration + INSERT fix).
- [PR #209](https://github.com/jaetill/ai-teacher/pull/209) — adds owner-scoped WHERE guard on the notes route (depends on this ADR's column).
- [Issue #210](https://github.com/jaetill/ai-teacher/issues/210) — bug report: units created without `owner_email` cause 404 on notes save.
