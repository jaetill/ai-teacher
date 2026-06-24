# ADR-0024: Authorization model — owner-scoped data + backfill NULL owners to NOT NULL

- **Status:** Proposed
- **Date:** 2026-06-23
- **Deciders:** Jason
- **Tags:** schema, security, authorization

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

ai-teacher accumulated a cluster of IDOR findings (e.g. #106, #116, #121, #152, #208, #219) with a shared root cause: ownership was modeled as a **nullable** `owner_email` column (ADR-0021, ADR-0022). A nullable owner created two failure modes that fed every subsequent finding:

1. **Write side (#208):** course-creating routes (`POST /api/import/build-curriculum`, `POST /api/year-plan/save`) inserted courses **without** stamping `owner_email`, so every newly created course was `NULL`-owned and therefore world-readable by any authenticated user.
2. **Read side:** because the column was nullable, routes grew defensive "NULL-owner special-case" arms (`!course.ownerEmail || course.ownerEmail !== userEmail`, and the historical `isNull(ownerEmail)` "legacy row" arms). Those arms were the exact surface that turned an auth failure into accidental access — and each one spawned its own review finding.

A second, separate inconsistency was the auth helper (#228): `requireEmail()` was specified to return `null` on **both** "no session" and "session without an email," which callers conflated with "found no rows" — an auth failure silently rendered as a success.

This is a **security refactor of a live app with one real user (the owner)**. Two questions need a ratified answer:

1. How do protected API routes establish *who is calling* and scope data to them?
2. What do we do about the existing `NULL`-`owner_email` rows — keep NULL as a modeled state, or eliminate it?

## Decision Drivers

- **Correctness over cleverness.** The legitimate owner must never be locked out of their own data; the migration order must guarantee that.
- **Eliminate the attack surface at the root.** A nullable owner is an open question on every row and every route; the cheapest correct fix removes the question.
- **Single real user.** ai-teacher serves exactly one teacher today. There is no population of "shared/legacy" rows that legitimately belong to no one — every existing row belongs to the owner.
- **Consistency.** "Who is calling" should be resolved one way, in one place, with one unambiguous unauthenticated signal.
- **Drizzle + Neon + NextAuth (Google).** `session.user.email` is the stable identity claim; the DB is PostgreSQL via Neon; schema is Drizzle.

## Considered Options

This ADR bundles two tightly-coupled sub-decisions.

### Sub-decision 1 — Authorization model

- **Option 1A:** Every protected route resolves the caller's email via a shared auth helper and scopes **all** DB reads/writes by `ownerEmail = thatEmail`.
- **Option 1B:** Keep ad-hoc per-route session handling; add ownership predicates case by case as findings arrive.

### Sub-decision 2 — NULL-`owner_email` policy

- **Option 2A:** **Backfill** the existing `NULL`-owner rows to the single real owner, then make `owner_email` **NOT NULL** so a NULL owner can never recur.
- **Option 2B:** Keep `owner_email` nullable; manage NULL as a "legacy/unclaimed" state with a partial unique index and per-route NULL handling.

## Decision Outcome

**Sub-decision 1: chosen Option 1A** — owner-scoped data model with a single auth helper.

**Sub-decision 2: chosen Option 2A** — backfill NULL owners to the owner, then `NOT NULL`.

Rationale: with exactly one real user, every `NULL`-owner row provably belongs to that user, so backfilling is lossless. Making the column `NOT NULL` then deletes the entire class of "what does NULL mean here" bugs at the source — the defensive null arms become dead code, and no future insert can recreate a world-readable row. Option 2B (the keep-NULL / partial-index approach and its three PRs) was explicitly closed: it perpetuates the nullable state that *is* the root cause, trading a schema fix for permanent per-route vigilance.

This ADR **supersedes the "column is nullable / made NOT NULL only once a users table lands" stance** of ADR-0021 (Neutral §) and ADR-0022. The owner identity remains `owner_email` (text); a future `users`-table FK migration is still possible and unaffected by the NOT NULL constraint.

**Scope note (foundation):** this decision establishes the *model* and the *data foundation* (migration, NOT NULL, constraint, write-side owner stamping, the auth helper, removal of the now-dead null arms). The per-endpoint scoping of routes that today have **no** ownership check at all (pure auth-without-authz: #106, #116, #121, #152, #219, #238) is a **separate follow-up sweep** — those routes are not modified here except where removing a dead null arm already scopes them.

## Consequences

### Positive

- **Root-cause fix.** `NOT NULL` makes a world-readable (NULL-owned) row unrepresentable. The defensive `!ownerEmail ||` / `isNull(ownerEmail)` arms become dead and are removed, shrinking the IDOR surface to zero for the covered routes.
- **Write side closed (#208).** Every course-creating path now stamps `ownerEmail` on insert; the find-or-create fallbacks are owner-scoped, so a route can never reuse or build into another owner's course.
- **One unambiguous auth signal (#228).** `requireEmail()` returns a discriminated result (`{ email }` | `{ response }` 401); unauthenticated can no longer be mistaken for "no rows."
- **Cross-owner uniqueness fixed.** The `courses` unique key now includes `owner_email`, so two owners can each hold a "Grade 8 ELA / 2025-2026" course without collision — no partial NULL index needed.

### Negative

- **Ordering-sensitive deploy.** The migration MUST run (with the placeholder replaced) **before** the new code deploys. Deploying NOT-NULL / no-null-arm code against un-backfilled rows would 403 the owner out of their own data. Mitigated by an explicit runbook and a held PR (human applies the migration).
- **Manual placeholder substitution.** The backfill uses a `__OWNER_EMAIL__` placeholder that a human must replace with the real owner email at apply time (PII is not committed). A missed substitution fails loudly (the literal string becomes the owner) rather than silently.
- **Denormalized identity persists.** Email is still duplicated per row (inherited from ADR-0021); a future `users`-table FK migration is the normalization path.

### Neutral

- **`units.user_id` is out of scope.** Units are owned via `user_id` (Google OAuth `sub`), a different column and identity than `owner_email`; this ADR does not restructure it (see #135/#140 follow-ups).
- **Seed script now requires `SEED_OWNER_EMAIL`.** Dev seeding must specify an owner (env var), matching the NOT NULL invariant without hardcoding PII.

## Pros and Cons of the Options

### Option 1A: Shared helper + owner-scoped reads/writes

- ✅ Pro: One place resolves identity; routes can't drift on "who is calling."
- ✅ Pro: Owner scoping is explicit at the query layer and auditable.
- ❌ Con: Every protected route must adopt the helper and a predicate (paid down incrementally; the no-authz routes are the follow-up sweep).

### Option 1B: Ad-hoc per-route handling

- ✅ Pro: No upfront refactor.
- ❌ Con: This is the status quo that produced the IDOR cluster — each route is a fresh chance to forget the predicate.
- ❌ Con: No single unauthenticated signal; null-vs-no-rows conflation recurs.

### Option 2A: Backfill to owner, then NOT NULL

- ✅ Pro: Eliminates the NULL-owner class entirely; dead-codes the null arms.
- ✅ Pro: Lossless for a single-user app — every NULL row is provably the owner's.
- ✅ Pro: Simple unique key (`+ owner_email`), no partial index.
- ❌ Con: Requires a careful migrate-before-deploy ordering (mitigated by the runbook).

### Option 2B: Keep nullable, manage NULL as "unclaimed"

- ✅ Pro: No backfill step.
- ❌ Con: Perpetuates the exact nullable state that is the root cause.
- ❌ Con: Needs a partial unique index and permanent per-route NULL handling.
- ❌ Con: Already attempted and **closed** (three PRs) in favor of this ADR.

## Implementation notes

- **Migration:** `drizzle/0008_owner_email_not_null_backfill.sql` — single transaction (BEGIN/COMMIT, addresses #391): backfill `courses` + `copilot_conversations` NULL `owner_email` to `__OWNER_EMAIL__`, then `SET NOT NULL` on both, then widen `uq_courses_grade_subject_year` to include `owner_email`. Snapshot/journal: `drizzle/meta/0008_snapshot.json`, `_journal.json`.
- **Schema:** `src/db/schema/courses.ts` and `src/db/schema/copilot.ts` — `owner_email` now `.notNull()`; courses unique constraint includes `ownerEmail`.
- **Auth helper (#228):** `src/lib/auth-helpers.ts` — `requireEmail()` returns `{ email } | { response }` (401). Adopted in `copilot/route.ts` and `curriculum/editor/data/route.ts`.
- **Write-side owner stamping (#208):** `import/build-curriculum/route.ts` and `year-plan/save/route.ts` set `ownerEmail` on course insert and scope the find-or-create fallback by owner.
- **Dead-arm removal:** the `!course.ownerEmail ||` / `!conv.ownerEmail ||` post-query null re-checks in `curriculum/editor/data/route.ts` and `copilot/route.ts` are removed (the NOT NULL column + `eq(ownerEmail, email)` WHERE are the sole, sufficient gate).
- **Runbook:** `drizzle/MIGRATION-0008-RUNBOOK.md` — required apply order (replace placeholder → migrate → deploy) and rollback.
- **Implementation:** held PR `feat(authz): owner-scoped data model …` (foundation). Migration is applied by the human (placeholder replaced first); do NOT merge before applying.
- **Follow-up:** per-endpoint scoping for the pure auth-without-authz routes (#106, #116, #121, #152, #219, #238); `units.user_id` IDOR hardening (#135, #140).

## Links

- [OWASP IDOR](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/05-Authorization_Testing/04-Testing_for_Insecure_Direct_Object_References) — the vulnerability class this addresses.
- [ADR-0021](0021-course-ownership-column.md) — introduced the nullable `owner_email` column; superseded here on the nullability question.
- [ADR-0022](0022-copilot-conversation-ownership-column.md) — copilot conversation ownership column; superseded here on the nullability question.
- [Issue #228](https://github.com/jaetill/ai-teacher/issues/228) — `requireEmail` null-return ambiguity.
- [Issue #208](https://github.com/jaetill/ai-teacher/issues/208) — courses created NULL-owned / world-readable.
- [Issue #391](https://github.com/jaetill/ai-teacher/issues/391) — multi-statement migration lacked a transaction.
