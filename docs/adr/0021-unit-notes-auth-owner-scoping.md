# ADR-0021: Auth Guard and Owner-Scoped Writes for POST /api/units/[id]/notes

- **Status:** Proposed
- **Date:** 2026-06-05
- **Deciders:** Jason
- **Tags:** api-contract, security, authorization

> Format: MADR 4.x (single-decision form). See [`template.md`](template.md).

## Context and Problem Statement

`POST /api/units/[id]/notes` accepts a unit ID and a `notes` string, then writes `teacher_notes` to the matching row in the `units` table. Prior to this change the endpoint performed no authentication and no ownership check — any caller who could guess or enumerate a unit UUID could overwrite another user's notes. This is a classic Insecure Direct Object Reference (IDOR) vulnerability.

How should the endpoint enforce that only the owning teacher can update a unit's notes, and what data-model change is needed to support that enforcement?

## Decision Drivers

- **IDOR severity.** Unauthenticated write access to any unit by ID is a critical authorization gap. Even in a single-teacher deployment today, the app is designed for eventual multi-user access; shipping an unguarded write endpoint sets a precedent that is expensive to retrofit.
- **Minimal blast radius.** The fix should be scoped to this endpoint without requiring a full authorization framework rollout across every route.
- **Data-model readiness.** The `units` table has no ownership column. Any row-level authorization strategy needs a way to associate a unit with its owner.
- **Existing auth infrastructure.** NextAuth (`next-auth`) with `getServerSession` is already configured in the project (`src/lib/auth.ts`); the session carries `user.email`.

## Considered Options

- **Option A: Session guard + `owner_email` column on `units`** — Add `owner_email text` to `units` via migration; require a valid NextAuth session; scope the UPDATE WHERE clause to `(units.owner_email = session.user.email OR units.owner_email IS NULL)` so legacy rows without an owner remain writable.
- **Option B: Middleware-level auth + separate ownership table** — Introduce a generic Next.js middleware that guards all `/api/units/*` routes; store ownership in a separate `entity_owners` join table.
- **Option C: Session guard only (no ownership column)** — Require authentication but continue to allow any authenticated user to update any unit. Defer row-level ownership to a future authorization ADR.

## Decision Outcome

Chosen option: **Option A — Session guard + `owner_email` column on `units`**, because it closes the IDOR with the smallest possible change (one nullable column, one migration, one route edit) while using the auth infrastructure already in place. The ownership column is additive and nullable, so existing rows are unaffected by the migration.

## Consequences

### Positive

- **IDOR closed.** Unauthenticated callers receive 401; authenticated callers who do not own the unit receive 404 (no information leakage about whether the unit exists).
- **Progressive hardening.** The `owner_email` column can be reused by other unit-scoped endpoints as they are similarly hardened, without requiring a second migration.
- **No new dependencies.** Uses `getServerSession` and `authOptions` already present in the project.

### Negative

- **Contract break for existing callers.** Any client that previously called this endpoint without a session cookie will now receive 401. This is intentional — the prior behavior was a vulnerability, not a feature — but any integration tests or scripts that skip auth will break.
- **Nullable ownership column.** Units created before this migration have `owner_email = NULL`. The WHERE clause uses `OR owner_email IS NULL` so that any authenticated user can update legacy rows. This is a pragmatic trade-off: legacy units are world-writable to authenticated users until their `owner_email` is backfilled. A backfill migration or admin script is a follow-up task.
- **Email as ownership key.** Using `email` rather than a stable user ID couples ownership to the email address. If a user changes their email, their ownership link breaks. Acceptable for a single-teacher MVP; a future user-ID-based ownership model (once a `users` table exists) should supersede this.

### Neutral

- **404 vs 403 semantics.** The endpoint returns 404 (not 403) when the unit exists but is not owned by the caller. This is a deliberate choice to avoid leaking unit existence to non-owners, but it means the caller cannot distinguish "unit does not exist" from "unit exists but you don't own it."

## Pros and Cons of the Options

### Option A: Session guard + `owner_email` column (chosen)

- ✅ Pro: Closes the IDOR completely in a single PR.
- ✅ Pro: Reuses existing NextAuth infrastructure — no new auth dependencies.
- ✅ Pro: `owner_email` column is reusable for other unit-scoped endpoints.
- ❌ Con: Email-based ownership is fragile if emails change.
- ❌ Con: Legacy units with NULL `owner_email` are writable by any authenticated user until backfilled.

### Option B: Middleware-level auth + separate ownership table

- ✅ Pro: Generic middleware protects all unit routes at once.
- ✅ Pro: Join table supports complex ownership models (teams, delegates).
- ❌ Con: Significantly larger scope — requires designing a general authorization model before a single endpoint can be fixed.
- ❌ Con: Join table adds query complexity for every unit operation.

### Option C: Session guard only (no ownership column)

- ✅ Pro: Smallest possible change — just add `getServerSession` check.
- ❌ Con: Does not close the IDOR for multi-user scenarios — any authenticated user can still update any unit.
- ❌ Con: Defers the hard part (ownership) without a concrete timeline.

## Implementation notes

- **Migration:** `drizzle/0005_unit_owner_email.sql` — `ALTER TABLE "units" ADD COLUMN "owner_email" text;`
- **Schema:** `src/db/schema/units.ts` — adds `ownerEmail: text("owner_email")` to the Drizzle table definition.
- **Route:** `src/app/api/units/[id]/notes/route.ts` — `getServerSession` guard + compound WHERE clause (`units.id = :id AND (units.owner_email = :email OR units.owner_email IS NULL)`).
- **Tests:** `tests/api/units-id-notes.test.ts` — covers 401 (no session), 401 (no email), 200 (owner match), 404 (no match), IS NULL regression guard.
- **Follow-up needed:** Backfill `owner_email` on existing units; extend the same pattern to other unit-write endpoints (`PATCH /api/units/[id]`, etc.).

## Links

- PR #167 — fix(security): IDOR on POST /api/units/[id]/notes
- [OWASP IDOR](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/05-Authorization_Testing/04-Testing_for_Insecure_Direct_Object_References) — reference for the vulnerability class.
