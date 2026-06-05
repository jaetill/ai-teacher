# ADR-0021: Auth Guard and Owner-Scoped Writes for POST /api/units/[id]/notes

- **Status:** Accepted
- **Date:** 2026-06-05
- **Deciders:** Jason
- **Tags:** api-contract, security, authorization

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled.

## Context and Problem Statement

`POST /api/units/[id]/notes` accepts a unit ID and a `notes` string, then writes `teacher_notes` to the matching row in the `units` table. Prior to this change the endpoint performed no authentication and no ownership check — any caller who could guess or enumerate a unit UUID could overwrite another user's notes. This is a classic Insecure Direct Object Reference (IDOR) vulnerability.

How should the endpoint enforce that only the owning teacher can update a unit's notes, and what data-model change is needed to support that enforcement?

## Decision Drivers

- **IDOR severity.** Unauthenticated write access to any unit by ID is a critical authorization gap.
- **Minimal blast radius.** The fix should be scoped to this endpoint without requiring a full authorization framework rollout.
- **Data-model readiness.** The `units` table has no ownership column. Row-level authorization needs a way to associate a unit with its owner.
- **No IS NULL bypass.** A prior proposed fix (PR #175) used `OR owner_email IS NULL` to handle pre-migration units — this was rejected (issue #177) because it allowed any authenticated user to overwrite any NULL-owner unit, partially re-opening the IDOR.

## Considered Options

- **Option A: Session guard + `owner_email` column, strict equality only** — Add `owner_email text` to `units` via migration; require a valid NextAuth session; scope the UPDATE WHERE clause to `AND(eq(units.id, id), eq(units.owner_email, email))`. Legacy units (NULL `owner_email`) return 404 until backfilled.
- **Option B: Session guard + `owner_email` column, IS NULL escape hatch** — Same as A but extend the WHERE clause to `(owner_email = email OR owner_email IS NULL)` so pre-migration units remain writable. Rejected because it allows cross-user writes on legacy rows (issue #177).
- **Option C: Session guard only (no ownership column)** — Require authentication but continue allowing any authenticated user to update any unit. Does not close the IDOR for multi-user scenarios.

## Decision Outcome

Chosen option: **Option A — strict equality, no IS NULL arm**, because it fully closes the IDOR while keeping the change minimal. Legacy units with a NULL `owner_email` are deliberately inaccessible until their owner is backfilled; this is preferable to the cross-user write risk introduced by the IS NULL bypass.

## Consequences

### Positive

- **IDOR closed.** Unauthenticated callers receive 401; authenticated callers who do not own the unit receive 404 (no unit-existence leakage).
- **No IS NULL bypass.** Pre-migration units are not writable by arbitrary authenticated users.
- **Progressive hardening.** The `owner_email` column can be reused by other unit-scoped endpoints.
- **No new dependencies.** Uses `getServerSession` and `authOptions` already present in the project.

### Negative

- **Contract break for existing callers.** Any client that previously called this endpoint without a session cookie will now receive 401. This is intentional — the prior behavior was a vulnerability.
- **Legacy units locked until backfill.** Units created before migration 0005 have `owner_email = NULL` and will return 404 on notes save until their `owner_email` is populated. A backfill migration or admin script is a follow-up task.
- **Email as ownership key.** Using `email` rather than a stable user ID couples ownership to the email address. Acceptable for MVP; supersede when a `users` table exists.

### Neutral

- **404 vs 403 semantics.** The endpoint returns 404 (not 403) when the unit exists but is not owned by the caller. Deliberate — avoids leaking unit existence to non-owners.

## Pros and Cons of the Options

### Option A: Strict equality (chosen)

- ✅ Pro: Fully closes the IDOR for both unauthenticated and cross-user write scenarios.
- ✅ Pro: Reuses existing NextAuth infrastructure.
- ❌ Con: Legacy NULL-owner units are inaccessible until backfilled.

### Option B: IS NULL escape hatch (rejected — issue #177)

- ✅ Pro: Pre-migration units remain writable after upgrade.
- ❌ Con: Any authenticated user can overwrite any NULL-owner unit — partially re-opens IDOR.
- ❌ Con: ADR negative-consequences section would have to document world-writable legacy rows as an explicit risk.

### Option C: Session guard only

- ✅ Pro: Smallest possible change.
- ❌ Con: Does not close the cross-user IDOR.

## Implementation notes

- **Migration:** `drizzle/0005_unit_owner_email.sql` — `ALTER TABLE "units" ADD COLUMN "owner_email" text;`
- **Schema:** `src/db/schema/units.ts` — adds `ownerEmail: text("owner_email")` to the Drizzle table definition.
- **Route:** `src/app/api/units/[id]/notes/route.ts` — `getServerSession` guard + `AND(eq(units.id, id), eq(units.ownerEmail, userEmail))`. No IS NULL arm.
- **Tests:** `tests/api/units-id-notes.test.ts` — covers 401 (no session), 401 (no email), 200 (owner match), 404 (no match), 404 (NULL-owner unit, regression guard for issue #177).
- **Follow-up needed:** Backfill `owner_email` on legacy units; extend the same pattern to other unit-write endpoints (`PATCH /api/units/[id]`, etc.).

## Links

- Issue #157 — original IDOR report.
- Issue #177 — IS NULL cross-user write regression (code-review finding that drove Option B's rejection).
- [OWASP IDOR](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/05-Authorization_Testing/04-Testing_for_Insecure_Direct_Object_References) — reference for the vulnerability class.
