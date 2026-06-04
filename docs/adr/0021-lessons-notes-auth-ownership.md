# ADR-0021: Auth + ownership guard on `POST /api/lessons/:id/notes`

- **Status:** Proposed
- **Date:** 2026-06-04
- **Deciders:** Jason
- **Tags:** api-contract, security, auth

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

`POST /api/lessons/:id/notes` saves free-text teacher notes against a lesson. The original implementation performed no authentication and no ownership check — any caller who knew a lesson ID could overwrite another user's notes. GitHub issues #160 and #161 flagged this as an IDOR (Insecure Direct Object Reference) vulnerability.

How should we secure this endpoint, and how should ownership be modeled at the data layer to support the guard?

## Decision Drivers

- **IDOR elimination.** The endpoint must not allow one user to modify another user's lesson data.
- **Minimal schema change.** The lessons table has no existing owner column; the fix must add one without breaking existing data or requiring a backfill before deploy.
- **Consistent auth pattern.** The project uses NextAuth (`next-auth`) with `getServerSession` elsewhere; the fix should follow the same pattern.
- **Contract clarity.** Changing response codes (previously 404, now 401/403) is a breaking contract change for any existing client; the rationale must be recorded.

## Considered Options

- **Option A:** Session auth + `owner_email` column on `lessons` — authenticate via `getServerSession`, add a nullable `owner_email` column, filter the UPDATE WHERE clause on both `id` and `owner_email`.
- **Option B:** Session auth + ownership lookup in a separate query — authenticate, then SELECT the lesson to check ownership before the UPDATE.
- **Option C:** Middleware-level auth only (no per-row ownership) — require a valid session but allow any authenticated user to edit any lesson's notes.

## Decision Outcome

Chosen option: **Option A — session auth + `owner_email` column with WHERE-clause guard**, because it eliminates the IDOR in a single atomic query (no TOCTOU race between a SELECT check and the UPDATE), adds the ownership concept at the schema level for reuse by other endpoints, and keeps the route handler simple.

## Consequences

### Positive

- **IDOR closed.** Unauthenticated callers receive 401. Authenticated callers who don't own the lesson receive 403 (the UPDATE returns zero rows). No separate authorization query needed.
- **Atomic ownership check.** The WHERE clause `id = :id AND owner_email = :email` makes the ownership guard and the mutation a single statement — no race condition.
- **Reusable ownership column.** `owner_email` on `lessons` can be used by future endpoints (e.g., GET, DELETE, PATCH) without additional schema work.

### Negative

- **Breaking API contract.** Existing clients (if any) that call this endpoint without a session will now receive 401 instead of 200. The previous 404 for missing lessons is now a 403 (ambiguates "not found" and "not yours"). This is intentional — leaking lesson existence to unauthorized callers is itself an information disclosure.
- **Nullable column means legacy rows have no owner.** Lessons created before this migration have `owner_email = NULL`. The WHERE-clause guard (`owner_email = :email`) will not match NULL, so legacy lessons cannot have their notes updated until `owner_email` is backfilled. This is acceptable because the app is pre-launch with a single user; a backfill migration or script can follow.
- **Email as ownership key.** Using `email` rather than a stable user ID couples ownership to the auth provider's email claim. Acceptable for the current single-user/NextAuth setup; if the auth model changes (e.g., to Cognito with opaque `sub` IDs), the column will need migration.

### Neutral

- **Error semantics shifted.** 404 → 403 for the "no matching row" case. Both are valid HTTP semantics; 403 is arguably more correct since the route itself exists and the denial is authorization-based.
- **No backfill in this migration.** Existing lessons keep `owner_email = NULL`. A follow-up migration or script is expected but not required for the security fix to land.

## Pros and Cons of the Options

### Option A: Session auth + `owner_email` WHERE-clause guard

- ✅ Pro: Single atomic query — no TOCTOU race.
- ✅ Pro: Adds ownership to the schema, reusable across endpoints.
- ✅ Pro: Minimal code — one additional WHERE predicate, one new column.
- ❌ Con: Nullable column means legacy rows are temporarily inaccessible for note edits.
- ❌ Con: Email-based ownership rather than stable user ID.

### Option B: Session auth + separate ownership SELECT

- ✅ Pro: Can return differentiated 404 (not found) vs 403 (not yours) responses.
- ❌ Con: Two queries — TOCTOU race between SELECT and UPDATE unless wrapped in a transaction.
- ❌ Con: More code and an additional round-trip to the database.
- ❌ Con: Still requires the `owner_email` column (or equivalent) for the SELECT check.

### Option C: Middleware-level auth only (no per-row ownership)

- ✅ Pro: Simplest change — just add `getServerSession` check.
- ❌ Con: Does not fix the IDOR. Any authenticated user can edit any lesson's notes.
- ❌ Con: Leaves the core vulnerability open; only raises the bar from "anyone" to "any logged-in user."

## Implementation notes

- **Schema migration:** `drizzle/0005_lessons_owner_email.sql` — `ALTER TABLE "lessons" ADD COLUMN "owner_email" text;`
- **Drizzle schema:** `src/db/schema/lessons.ts` — added `ownerEmail: text("owner_email")` field.
- **Route handler:** `src/app/api/lessons/[id]/notes/route.ts` — `getServerSession` + `and(eq(lessons.id, id), eq(lessons.ownerEmail, email))`.
- **Tests:** `tests/api/lessons-notes.test.ts` — covers 401 (no session), 401 (no email), 403 (wrong owner), 200 (happy path).
- **Follow-up needed:** Backfill `owner_email` for existing lessons. Evaluate replacing `email` with a stable user ID if/when auth moves to Cognito.

## Links

- [OWASP IDOR](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/) — the vulnerability class this ADR addresses.
- [NextAuth `getServerSession`](https://next-auth.js.org/configuration/nextjs#getserversession) — the auth mechanism used.
- GitHub issues [#160](https://github.com/jaetill/ai-teacher/issues/160), [#161](https://github.com/jaetill/ai-teacher/issues/161) — the IDOR reports that prompted this fix.
