# ADR-0023: Unit ownership — `user_id` column on `units` table

- **Status:** Proposed
- **Date:** 2026-06-20
- **Deciders:** Jason
- **Tags:** schema, security, authorization

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

`POST /api/units/[id]/infer-standards` had no authentication or authorization checks. Any caller — authenticated or not — could read another user's lesson data, trigger billed Anthropic API calls, and write AI-generated standard mappings into any unit's database rows (issue #141, related to closed PR #130).

ADR-0021 and ADR-0022 established a nullable `owner_email text` column pattern for `courses` and `copilot_conversations`. This PR extends ownership to `units`, but introduces two departures from the prior pattern:

1. **Identity claim:** `user_id` (Google OAuth `sub` via `token.sub`) instead of `owner_email`. The `sub` claim is immutable and stable across email changes; `email` can change if a user renames their Google account.
2. **Null-handling policy:** Open-null (any authenticated user may access rows with `userId = NULL`) instead of the fail-closed policy in ADR-0022 (null `ownerEmail` rows return 403).

How should unit ownership be represented, and how should the identity claim and null-handling policy relate to the patterns established in ADR-0021 and ADR-0022?

## Decision Drivers

- **Security.** The unauthenticated access and IDOR on `infer-standards` must be closed.
- **Identity stability.** Google OAuth `sub` is immutable; `email` can change on consumer Gmail accounts. Using `sub` avoids the "email changed, all rows orphaned" failure mode noted in ADR-0021.
- **Consistency across tables.** `courses.owner_email` and `copilot_conversations.owner_email` already use email as the identity claim. Introducing `user_id` (sub) on `units` creates two identity systems in the same database.
- **Migration safety.** Pre-auth rows have no ownership data. The null-handling policy determines whether those rows are accessible or locked out during the migration window.
- **Schema evolution.** A future `users` table (CLAUDE.md: "Auth: TBD") will unify identity. The column should be replaceable with an FK.

## Considered Options

- **Option A:** Add nullable `user_id text` column (OAuth `sub`), open-null policy
- **Option B:** Add nullable `owner_email text` column (matching ADR-0021/0022 pattern), fail-closed null policy
- **Option C:** Derive ownership from `courses.owner_email` via the existing `units.course_id` FK — no new column
- **Option D:** Create a `users` table now, add `owner_id uuid` FK to `units`

## Decision Outcome

Chosen option: **Option A — nullable `user_id` text column with open-null policy**, because it closes the security vulnerability immediately, uses the more stable OAuth `sub` claim, and preserves access to legacy rows during the migration window.

This decision intentionally diverges from the `owner_email` pattern in ADR-0021/0022. The divergence creates a follow-up obligation: when a `users` table is introduced, both `owner_email` and `user_id` columns across all tables must converge to a single `owner_id uuid` FK.

## Consequences

### Positive

- **Vulnerability closed.** The `infer-standards` endpoint now requires authentication (401) and enforces ownership (403).
- **Stable identity claim.** `sub` is immutable in the Google OAuth spec, eliminating the email-change fragility noted in ADR-0021.
- **Legacy rows remain accessible.** Teachers can continue using pre-auth units without a manual backfill step — reducing operational friction compared to the ADR-0022 fail-closed approach.
- **Zero-downtime migration.** `ALTER TABLE ADD COLUMN` with no `NOT NULL` constraint is non-blocking.

### Negative

- **Two identity systems.** `courses` and `copilot_conversations` use `owner_email`; `units` uses `user_id` (sub). Queries that join across these tables for ownership checks must reconcile two different claims. This is technical debt that must be resolved when the `users` table lands.
- **Open-null is less secure than fail-closed.** Any authenticated user can access legacy unit rows, including units belonging to other teachers. For the single-teacher deployment this is acceptable; for multi-teacher it is not. The migration window must be finite.
- **No index on `user_id`.** Acceptable for single-teacher workload; multi-user scaling needs `CREATE INDEX`.

### Neutral

- **Column is nullable by design.** Same rationale as ADR-0021/0022: intentional for backward compatibility, not permanent.
- **Ownership guard is one-directional.** Only the `infer-standards` endpoint is hardened in this PR. Other unit endpoints (CRUD) will need the same guard in follow-up work.

## Pros and Cons of the Options

### Option A: Nullable `user_id` text column, open-null policy

- ✅ Pro: Uses immutable OAuth `sub` — no email-change risk.
- ✅ Pro: Legacy rows remain usable without backfill, reducing deployment friction.
- ✅ Pro: Ships immediately — one migration, one code change.
- ❌ Con: Inconsistent with `owner_email` on `courses` and `copilot_conversations`.
- ❌ Con: Open-null policy means legacy rows are accessible to any authenticated user.

### Option B: Nullable `owner_email` text column, fail-closed null policy

- ✅ Pro: Consistent with ADR-0021/0022 — same column name, same identity claim, same null behavior.
- ✅ Pro: Fail-closed is more secure during the migration window.
- ❌ Con: Inherits the email-change fragility documented in ADR-0021.
- ❌ Con: Locks out all pre-auth unit rows until manually backfilled — operational step required before the fix is fully usable.

### Option C: Derive ownership from `courses.owner_email` via FK

- ✅ Pro: No new column — ownership is transitive through the existing `course_id` FK.
- ✅ Pro: Single source of truth for ownership (the course).
- ❌ Con: Every ownership check requires a join to `courses`, coupling all unit endpoints to the courses schema.
- ❌ Con: If a unit ever exists without a course (orphaned or template), ownership is undefined.
- ❌ Con: Still uses `owner_email`, not `sub`.

### Option D: Create `users` table now, add `owner_id` FK

- ✅ Pro: Normalized from day one — resolves the identity-claim divergence.
- ❌ Con: Same objections as ADR-0021/0022 Option B — premature commitment before auth is settled.
- ❌ Con: Blocks the security fix behind a larger migration and upsert-on-login logic.

## Implementation notes

- **Migration:** `drizzle/0007_add_user_id_to_units.sql` — `ALTER TABLE "units" ADD COLUMN "user_id" text;`
- **Schema:** `src/db/schema/units.ts` — `userId: text("user_id")`
- **Session wiring:** `src/lib/auth.ts` — `session.user.id = token.sub` in the NextAuth `session` callback. `src/types/next-auth.d.ts` updated to expose `user.id` on the `Session` type.
- **API route hardened:** `src/app/api/units/[id]/infer-standards/route.ts` — 401 session check + 403 ownership guard with open-null bypass.
- **Tests:** `tests/api/units-infer-standards.test.ts` — 4 tests: 401 (unauthenticated), no-Anthropic-call (unauthenticated), 403 (wrong owner), null-bypass (legacy row access).
- **Backfill (recommended post-deploy):** `UPDATE units SET user_id = '<google-sub>' WHERE user_id IS NULL;` — not strictly required (open-null), but recommended to close the migration window.
- **Follow-up — identity convergence:** When a `users` table is introduced, all three ownership columns (`courses.owner_email`, `copilot_conversations.owner_email`, `units.user_id`) must be migrated to `owner_id uuid REFERENCES users(id)`. This is the reconciliation point for the two-identity-system debt.
- **Follow-up — guard other unit endpoints:** The ownership guard in this PR covers only `infer-standards`. Other unit CRUD routes need the same treatment.

## Links

- [OWASP IDOR](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/05-Authorization_Testing/04-Testing_for_Insecure_Direct_Object_References) — the vulnerability class this addresses.
- [Issue #141](https://github.com/jaetill/ai-teacher/issues/141) — the null-bypass test request that triggered this work.
- [ADR-0021](0021-course-ownership-column.md) — prior art: `owner_email` on `courses`.
- [ADR-0022](0022-copilot-conversation-ownership-column.md) — prior art: `owner_email` on `copilot_conversations`, fail-closed null policy.
- [ADR-0001](0001-platform-adoption.md) — platform adoption; notes auth is TBD.
- [Google Identity: `sub` claim](https://developers.google.com/identity/openid-connect/openid-connect#an-id-tokens-payload) — documents `sub` as the stable, immutable user identifier.
