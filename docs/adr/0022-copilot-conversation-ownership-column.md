# ADR-0022: Copilot conversation ownership — `owner_email` column on `copilot_conversations` table

- **Status:** Proposed
- **Date:** 2026-06-16
- **Deciders:** Jason
- **Tags:** schema, security, authorization

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

`POST /api/copilot` accepted an optional `conversationId` parameter to append messages to an existing conversation. The route checked authentication (session must exist) but never verified that the supplied conversation belonged to the requesting user — a classic IDOR (issue #252). An authenticated user could read and extend any other user's conversation by guessing or enumerating UUIDs.

How should we represent conversation ownership in the database so that the copilot API can enforce per-user access control?

## Decision Drivers

- **Security.** The IDOR is an active vulnerability; the fix must ship immediately, not wait for a full users-table migration.
- **Consistency with ADR-0021.** The `courses` table already uses the same `owner_email` pattern. Applying the identical approach to `copilot_conversations` keeps the authorization model uniform across tables.
- **Single-teacher deployment.** ai-teacher currently serves one teacher. The ownership column must be correct for multi-user but does not need multi-tenant optimization yet.
- **Auth stack.** NextAuth with Google provider is the current auth layer. The session exposes `user.email` as the stable identity claim.
- **Backward compatibility.** Existing conversation rows have no ownership data. The migration must not break the running app before a backfill is applied.

## Considered Options

- **Option A:** Add a nullable `owner_email text` column to `copilot_conversations`, verify ownership on every `POST` that references an existing conversation
- **Option B:** Create a `users` table now, add `owner_id uuid` FK to `copilot_conversations`
- **Option C:** No schema change — enforce ownership via application middleware or a separate mapping table

## Decision Outcome

Chosen option: **Option A — nullable `owner_email` text column**, because it mirrors the proven pattern from ADR-0021, closes the IDOR with a single-column migration, and remains compatible with a future FK migration when a `users` table lands.

## Consequences

### Positive

- **IDOR closed.** The `POST` handler now verifies `conv.ownerEmail === session.user.email` before allowing messages to be appended to an existing conversation, returning 403 on mismatch or missing row.
- **Zero-downtime migration.** `ALTER TABLE ADD COLUMN` with no `NOT NULL` constraint is non-blocking on PostgreSQL. Existing rows get `NULL` and remain queryable until backfilled.
- **Consistent ownership model.** Both `courses` and `copilot_conversations` now use the same `owner_email` column pattern, simplifying future refactoring to a normalized `users` table.

### Negative

- **Denormalized identity.** Email is duplicated across conversation rows rather than normalized into a users table. If a teacher changes their Google account email, conversation rows must be updated alongside course rows.
- **Backfill required.** Existing conversations have `NULL` `owner_email`. The `POST` route returns 403 for conversations with no owner, so orphaned rows are inaccessible until backfilled. For the single-teacher deployment this is a one-time manual `UPDATE`.
- **No index on `owner_email`.** Acceptable for the current single-teacher workload, but multi-user scaling will need `CREATE INDEX`.

### Neutral

- **Column is nullable.** Intentional for backward compatibility, not a permanent design. When a `users` table is introduced, the column (or its FK replacement) can be made `NOT NULL`.
- **Ownership set at creation time only.** Conversations are not transferable between users. This matches the current single-teacher model and can be revisited if sharing or delegation features are needed.

## Pros and Cons of the Options

### Option A: Nullable `owner_email` text column

- ✅ Pro: Ships immediately — one migration, one code change, closes the IDOR today.
- ✅ Pro: Identical to the pattern already established in ADR-0021 for `courses`.
- ✅ Pro: Uses the same identity claim (`email`) already present in the NextAuth session, no join needed.
- ✅ Pro: Easy to replace later — when a `users` table lands, add `owner_id uuid REFERENCES users(id)`, backfill, drop the text column.
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
- ❌ Con: No database-level guarantee that queries are scoped — every route must remember to apply the filter.
- ❌ Con: Harder to audit — ownership is implicit rather than explicit in the data model.

## Implementation notes

- **Migration:** `drizzle/0006_add_copilot_conversations_owner_email.sql` — `ALTER TABLE "copilot_conversations" ADD COLUMN "owner_email" text;`
- **Schema:** `src/db/schema/copilot.ts` — `ownerEmail: text("owner_email")`
- **API route hardened:** `src/app/api/copilot/route.ts` — new conversation creation stores `ownerEmail: session.user?.email ?? null`; existing conversation access verifies `conv.ownerEmail === session.user?.email` and returns 403 on mismatch.
- **Tests:** `tests/api/copilot.test.ts` — IDOR guard tests covering wrong-owner and nonexistent-conversation scenarios.
- **Backfill (manual, post-deploy):** `UPDATE copilot_conversations SET owner_email = '<teacher-email>' WHERE owner_email IS NULL;`
- **Follow-up:** When a `users` table is introduced, migrate both `courses.owner_email` and `copilot_conversations.owner_email` to `owner_id uuid REFERENCES users(id)` in a single refactoring pass.

## Links

- [OWASP IDOR](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/05-Authorization_Testing/04-Testing_for_Insecure_Direct_Object_References) — the vulnerability class this addresses.
- [Issue #252](https://github.com/jaetill/ai-teacher/issues/252) — the IDOR report for copilot conversations.
- [ADR-0021](0021-course-ownership-column.md) — the identical pattern applied to the `courses` table.
- [ADR-0001](0001-platform-adoption.md) — platform adoption; notes auth is TBD.
