# ADR-0022: Copilot conversation ownership — `owner_email` column on `copilot_conversations` table

- **Status:** Proposed
- **Date:** 2026-06-17
- **Deciders:** Jason
- **Tags:** schema, security, authorization

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

`POST /api/copilot` accepted an optional `conversationId` to continue an existing conversation, but never verified that the caller owned that conversation. Any authenticated user could read and append to another user's copilot conversation by guessing or enumerating UUIDs (IDOR, issue #252). A first fix (PR #266) added an ownership check but used a naive strict-inequality comparison (`conv.ownerEmail !== session.user?.email`) that evaluated `null !== null` as `false`, granting access to every pre-migration row and any session with a null email (issue #269).

How should we represent copilot conversation ownership in the database and enforce it safely against null-bypass edge cases?

## Decision Drivers

- **Security.** Two open vulnerabilities (IDOR #252 and null-bypass #269) on the copilot endpoint must be closed together.
- **Consistency with ADR-0021.** The `courses` table already uses a nullable `owner_email text` column for the same purpose. Using the same pattern reduces cognitive overhead and keeps the eventual `users`-table migration uniform.
- **Null safety.** Pre-migration rows have `owner_email = NULL`. The ownership check must fail closed when either the stored owner or the session email is null — `null` must never match anything, including itself.
- **Backward compatibility.** The migration must be non-blocking and must not break the running app for existing rows.
- **Schema evolution.** Same as ADR-0021: the column should be replaceable with an FK to a future `users` table.

## Considered Options

- **Option A:** Add a nullable `owner_email text` column with a null-safe ownership guard
- **Option B:** Reuse the `courses.owner_email` column via a join (copilot conversations belong to a course)
- **Option C:** Create a `users` table now and add `owner_id uuid` FK

## Decision Outcome

Chosen option: **Option A — nullable `owner_email` text column with null-safe guard**, because it mirrors the proven ADR-0021 pattern, ships as a single-column migration, and the explicit null checks close both the IDOR and the null-bypass in one pass.

The null-safe guard rejects the request whenever _any_ of the four conditions is true: conversation not found, stored `ownerEmail` is null, session email is null, or emails don't match:

```typescript
if (!conv || !conv.ownerEmail || !session.user?.email || conv.ownerEmail !== session.user.email) {
  return Response.json({ error: "Forbidden" }, { status: 403 });
}
```

## Consequences

### Positive

- **Both vulnerabilities closed.** The IDOR (#252) and null-bypass (#269) are eliminated together.
- **Fail-closed on nulls.** Pre-migration rows with `owner_email = NULL` are inaccessible until backfilled, preventing the null-equals-null bypass class entirely.
- **Uniform ownership pattern.** Both `courses` and `copilot_conversations` now use the same `owner_email` column convention, making the future FK migration a single sweep.
- **Zero-downtime migration.** `ALTER TABLE ADD COLUMN` with no `NOT NULL` constraint is non-blocking on PostgreSQL.

### Negative

- **Denormalized identity.** Same trade-off as ADR-0021: email is duplicated across rows rather than normalized via a users table.
- **Pre-migration rows locked out.** Existing conversations with `owner_email = NULL` return 403 until backfilled. For the single-teacher deployment this is a one-time manual `UPDATE`.
- **No index.** Acceptable for single-teacher workload; multi-user scaling will need an index on `owner_email`.

### Neutral

- **Column is nullable by design.** Same rationale as ADR-0021: intentional for backward compatibility, not permanent. Will be tightened when a `users` table is introduced.
- **Ownership is set once at conversation creation.** There is no transfer mechanism. This matches the current UX — conversations are personal to the teacher who started them.

## Pros and Cons of the Options

### Option A: Nullable `owner_email` text column with null-safe guard

- ✅ Pro: Ships immediately — one migration, one code change, closes both vulnerabilities today.
- ✅ Pro: Mirrors ADR-0021 pattern — consistent, predictable schema evolution path.
- ✅ Pro: Null-safe guard is explicit and testable (5 dedicated test cases covering all null combinations).
- ❌ Con: Denormalized — email duplication across rows.
- ❌ Con: Pre-migration rows require a backfill step.

### Option B: Reuse `courses.owner_email` via join

- ✅ Pro: No new column — ownership is derived from the course's owner.
- ❌ Con: Not all copilot conversations are tied to a course (the `conversationId` is independent of any course context).
- ❌ Con: Adds a join to every ownership check, coupling copilot to the curriculum module.
- ❌ Con: Does not work for conversations created without a course context.

### Option C: Create `users` table now, add `owner_id` FK

- ✅ Pro: Normalized from day one.
- ❌ Con: Same objections as ADR-0021 Option B — premature commitment before auth is settled.
- ❌ Con: Blocks the security fix behind a larger migration.
- ❌ Con: Two tables, upsert-on-login logic, and FK constraints are out of proportion for closing an IDOR.

## Implementation notes

- **Migration:** `drizzle/0006_add_copilot_owner_email.sql` — `ALTER TABLE "copilot_conversations" ADD COLUMN "owner_email" text;`
- **Schema:** `src/db/schema/copilot.ts` — `ownerEmail: text("owner_email")`
- **API route hardened:** `src/app/api/copilot/route.ts` — null-safe ownership guard on existing `conversationId`; sets `ownerEmail` on new conversation creation.
- **Tests:** `tests/api/copilot.test.ts` — 7 tests covering 401 (no session), 400 (empty messages), 403 (wrong owner, not found, null owner + null session, null owner + real session, real owner + null session).
- **Backfill (manual, post-deploy):** `UPDATE copilot_conversations SET owner_email = '<teacher-email>' WHERE owner_email IS NULL;`
- **Follow-up:** When a `users` table is introduced, migrate `owner_email` to `owner_id uuid REFERENCES users(id)` and drop the text column (same follow-up as ADR-0021).

## Links

- [OWASP IDOR](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/05-Authorization_Testing/04-Testing_for_Insecure_Direct_Object_References) — the vulnerability class this addresses.
- [Issue #252](https://github.com/jaetill/ai-teacher/issues/252) — the original IDOR report.
- [Issue #269](https://github.com/jaetill/ai-teacher/issues/269) — the null-bypass report.
- [ADR-0021](0021-course-ownership-column.md) — prior art: same pattern applied to `courses` table.
- [ADR-0001](0001-platform-adoption.md) — platform adoption; notes auth is TBD.
