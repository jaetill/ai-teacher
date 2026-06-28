# ADR-0044: Drive folder ownership — `owner_email` column on `drive_folders` table

- **Status:** Proposed
- **Date:** 2026-06-28
- **Deciders:** Jason
- **Tags:** schema, security, authorization

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

`POST /api/drive/setup` creates Google Drive folder structures and persists the folder-key-to-drive-ID mapping in `drive_folders`. The table's unique constraint was `UNIQUE(folder_key)`, meaning the entire system could only hold one mapping per folder key — regardless of which teacher created it. In a multi-teacher scenario, Teacher B calling `/api/drive/setup` would overwrite Teacher A's folder IDs (IDOR, issue #480). Additionally, the `ownerEmail` column did not exist, so the upsert logic could not scope queries by caller identity.

How should the `drive_folders` table represent per-teacher ownership, and how should the unique constraint change to support multiple teachers with the same folder-key structure?

## Decision Drivers

- **Security.** The IDOR on `/api/drive/setup` (issue #480) must be closed: one teacher's setup must not clobber another teacher's folder mappings.
- **Consistency with ADR-0021/0022.** The `courses` and `copilot_conversations` tables use a nullable `owner_email text` column. Using the same identity claim reduces cognitive overhead and keeps the eventual `users`-table migration uniform.
- **Multi-tenant folder structure.** Every teacher gets the same folder-key hierarchy (root, grade-6, grade-7, etc.). The unique constraint must allow the same `folder_key` to exist once per teacher, not once globally.
- **Backward compatibility.** Pre-migration rows have `owner_email = NULL`. The constraint change must not violate uniqueness for existing data.
- **Schema evolution.** The column should be replaceable with an FK to a future `users` table.

## Considered Options

- **Option A:** Add nullable `owner_email text` column; widen unique constraint to `UNIQUE NULLS NOT DISTINCT (folder_key, owner_email)`
- **Option B:** Add nullable `owner_email text` column; keep existing `UNIQUE(folder_key)` constraint and add a separate index
- **Option C:** Create a `users` table now and add `owner_id uuid` FK

## Decision Outcome

Chosen option: **Option A — nullable `owner_email` column with a widened unique constraint**, because it is the only option that both scopes folder ownership per teacher and allows the same folder-key hierarchy to coexist for multiple teachers. The `NULLS NOT DISTINCT` modifier ensures that at most one legacy row (with `NULL` owner) can exist per folder key, preventing a null-bypass that would let unbounded anonymous rows accumulate.

## Consequences

### Positive

- **IDOR closed.** The setup upsert now scopes SELECT, INSERT, and UPDATE by `ownerEmail`, so one teacher's call cannot read or overwrite another teacher's folder mappings.
- **Multi-tenant folder keys.** The widened unique constraint `(folder_key, owner_email)` allows each teacher to have their own root → grade → quarter hierarchy under the same logical keys.
- **Null-bypass prevented.** `NULLS NOT DISTINCT` treats `NULL = NULL` as a match for uniqueness purposes, so at most one legacy row per folder key can exist with a null owner.
- **Uniform ownership pattern.** Uses the same `owner_email` column convention as `courses` (ADR-0021) and `copilot_conversations` (ADR-0022).
- **Zero-downtime migration.** The three-statement migration (ADD COLUMN, DROP old constraint, ADD new constraint) is non-blocking on PostgreSQL.

### Negative

- **Denormalized identity.** Same trade-off as ADR-0021/0022: email is duplicated across rows rather than normalized via a users table.
- **Divergence from ADR-0023.** The `units` table uses `user_id` (OAuth `sub`), while this table uses `owner_email`. The two identity systems must converge when a `users` table is introduced.
- **Pre-migration rows orphaned.** Existing rows with `owner_email = NULL` will not match any authenticated user's scoped queries. For the single-teacher deployment this requires a one-time backfill.
- **Session must carry email.** The route now returns 401 if `session.user.email` is absent, adding a hard dependency on the email claim being present in the NextAuth session.

### Neutral

- **Column is nullable by design.** Same rationale as ADR-0021/0022: intentional for backward compatibility, not permanent. Will be tightened when a `users` table is introduced.
- **Constraint name preserved.** The constraint is dropped and re-created with the same name (`uq_drive_folders_key`) but different columns. No downstream references to update.

## Pros and Cons of the Options

### Option A: Nullable `owner_email` column, widened unique constraint with `NULLS NOT DISTINCT`

- ✅ Pro: Closes the IDOR — SELECT, INSERT, and UPDATE are all scoped by owner.
- ✅ Pro: Allows the same folder-key hierarchy per teacher — the only option that supports true multi-tenancy.
- ✅ Pro: `NULLS NOT DISTINCT` prevents unbounded anonymous rows per folder key.
- ✅ Pro: Consistent with the `owner_email` pattern in ADR-0021/0022.
- ❌ Con: Denormalized email — same trade-off as prior ownership ADRs.
- ❌ Con: Pre-migration rows require a backfill step.

### Option B: Nullable `owner_email` column, keep `UNIQUE(folder_key)`

- ✅ Pro: Simpler migration — no constraint change.
- ❌ Con: Retains the global one-row-per-folder-key limitation. A second teacher calling setup would hit a unique-constraint violation or silently fail — the IDOR is traded for a denial-of-service.
- ❌ Con: Does not support multi-tenancy; defeats the purpose of per-teacher ownership.

### Option C: Create `users` table now, add `owner_id` FK

- ✅ Pro: Normalized from day one — resolves the identity-claim divergence across all tables.
- ❌ Con: Same objections as ADR-0021/0022/0023 Option D — premature commitment before auth is settled.
- ❌ Con: Blocks the security fix behind a larger migration, upsert-on-login logic, and FK constraints.

## Implementation notes

- **Migration:** `drizzle/0008_add_owner_email_to_drive_folders.sql` — three statements: `ALTER TABLE ADD COLUMN "owner_email" text`, `DROP CONSTRAINT "uq_drive_folders_key"`, `ADD CONSTRAINT "uq_drive_folders_key" UNIQUE NULLS NOT DISTINCT ("folder_key", "owner_email")`.
- **Schema:** `src/db/schema/drive-folders.ts` — `ownerEmail: text("owner_email")`, unique constraint widened to `(folderKey, ownerEmail).nullsNotDistinct()`.
- **API route hardened:** `src/app/api/drive/setup/route.ts` — extracts `ownerEmail` from session; returns 401 if missing; scopes SELECT WHERE, INSERT values, and UPDATE SET + WHERE by `ownerEmail`.
- **Tests:** `tests/api/drive/setup.test.ts` — 5 tests: 401 (no session), 401 (no email), ownerEmail in SELECT WHERE (IDOR guard), ownerEmail in INSERT values, ownerEmail in UPDATE SET + WHERE, 200 success.
- **Backfill (manual, post-deploy):** `UPDATE drive_folders SET owner_email = '<teacher-email>' WHERE owner_email IS NULL;`
- **Follow-up — identity convergence:** When a `users` table is introduced, all ownership columns (`courses.owner_email`, `copilot_conversations.owner_email`, `units.user_id`, `drive_folders.owner_email`) must be migrated to `owner_id uuid REFERENCES users(id)`.

## Links

- [OWASP IDOR](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/05-Authorization_Testing/04-Testing_for_Insecure_Direct_Object_References) — the vulnerability class this addresses.
- [Issue #480](https://github.com/jaetill/ai-teacher/issues/480) — the IDOR report for drive folder setup.
- [ADR-0021](0021-course-ownership-column.md) — prior art: `owner_email` on `courses`.
- [ADR-0022](0022-copilot-conversation-ownership-column.md) — prior art: `owner_email` on `copilot_conversations`.
- [ADR-0023](0023-unit-ownership-user-id-column.md) — prior art: `user_id` on `units` (different identity claim).
- [ADR-0001](0001-platform-adoption.md) — platform adoption; notes auth is TBD.
