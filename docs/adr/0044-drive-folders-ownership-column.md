# ADR-0044: Drive-folder ownership — `owner_email` column on `drive_folders` table

- **Status:** Proposed
- **Date:** 2026-06-28
- **Deciders:** Jason
- **Tags:** schema, security, authorization

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

`POST /api/drive/setup` creates a Google Drive folder hierarchy (root, per-grade, per-quarter, Lessons/Assessments) and upserts the resulting folder IDs into `drive_folders`. The upsert checked only `folder_key` to decide whether to INSERT or UPDATE, and the UPDATE's WHERE clause filtered on `folder_key` alone. In a multi-teacher deployment, teacher B calling `/api/drive/setup` would silently overwrite teacher A's Drive folder IDs because `folder_key` values (e.g. `"root"`, `"grade_6_Q1_Lessons"`) are deterministic and identical across accounts (issue #478).

How should we scope Drive folder ownership so that each teacher's folder records are isolated?

## Decision Drivers

- **Data isolation.** Two teachers calling the same endpoint must not clobber each other's Drive folder references. This is a correctness bug today and a data-loss risk.
- **Consistency with ADR-0021/0022.** `courses` and `copilot_conversations` already use `owner_email text` as the ownership column. Using the same claim keeps the eventual `users`-table migration uniform.
- **Identity-claim divergence.** ADR-0023 introduced `user_id` (OAuth `sub`) on `units`, creating a second identity system. Choosing `owner_email` here deepens that divergence but maintains consistency with the table most closely related to Drive (courses).
- **Unique constraint correctness.** The prior constraint `UNIQUE(folder_key)` is wrong in a multi-teacher world — the same folder key must be allowed for different owners. The replacement constraint must handle NULL owner emails for pre-migration rows without allowing duplicates.
- **Migration safety.** The column must be nullable so existing rows are not broken. The migration must be non-blocking.

## Considered Options

- **Option A:** Add nullable `owner_email text` column, compound unique constraint `(folder_key, owner_email)`, scope all queries by session email
- **Option B:** Add nullable `user_id text` column (OAuth `sub`, matching ADR-0023 pattern)
- **Option C:** Derive ownership from `courses.owner_email` via a join — no new column

## Decision Outcome

Chosen option: **Option A — nullable `owner_email` text column with compound unique constraint**, because it closes the data-isolation bug immediately, aligns with the `owner_email` pattern already established on `courses` (the table most related to Drive folders), and uses the identity claim readily available in the NextAuth session without additional wiring.

## Consequences

### Positive

- **Data isolation achieved.** Each teacher's folder records are keyed by `(folder_key, owner_email)`. Teacher B's setup cannot see or mutate teacher A's rows.
- **Consistent with ADR-0021/0022.** Same column name, same identity claim, same migration shape. The future `users`-table migration treats `drive_folders` identically to `courses` and `copilot_conversations`.
- **Zero-downtime migration.** `ALTER TABLE ADD COLUMN` (nullable) followed by `DROP CONSTRAINT` / `ADD CONSTRAINT` are non-blocking on PostgreSQL.

### Negative

- **Deepens the two-identity-system debt.** `units.user_id` uses OAuth `sub`; `drive_folders.owner_email` uses email. Joins across these tables for ownership checks require reconciling two claims. This debt carries until the `users` table lands.
- **Denormalized identity.** Email is duplicated across rows, same trade-off as ADR-0021.
- **Backfill required for legacy rows.** Existing `drive_folders` rows have `owner_email = NULL`. The `NULLS NOT DISTINCT` constraint prevents two NULL-owner rows with the same `folder_key`, so a backfill is needed before a second teacher can run setup if legacy rows exist.

### Neutral

- **`NULLS NOT DISTINCT` on the unique constraint.** PostgreSQL 15+ treats NULLs as equal for uniqueness purposes with this modifier. This prevents duplicate legacy rows for the same `folder_key` but also means at most one NULL-owner row can exist per folder key — acceptable for the single-teacher starting point.
- **No separate index on `owner_email`.** The compound unique constraint covers lookups by `(folder_key, owner_email)`. A standalone index is unnecessary at current scale.

## Pros and Cons of the Options

### Option A: Nullable `owner_email` text column, compound unique constraint

- ✅ Pro: Ships immediately — one migration, one route change, closes the isolation bug today.
- ✅ Pro: Uses the same identity claim (`email`) already present in the NextAuth session, matching `courses` and `copilot_conversations`.
- ✅ Pro: Compound unique constraint `(folder_key, owner_email)` enforces isolation at the database level, not just in application code.
- ✅ Pro: Easy to replace later — when a `users` table lands, add `owner_id uuid`, backfill, drop `owner_email`.
- ❌ Con: Denormalized — email duplication across rows.
- ❌ Con: Fragile if email changes (mitigated: Google Workspace emails are stable).
- ❌ Con: Deepens the identity-claim divergence with `units.user_id`.

### Option B: Nullable `user_id` text column (OAuth `sub`)

- ✅ Pro: Uses immutable OAuth `sub` — no email-change risk.
- ✅ Pro: Consistent with ADR-0023 (`units.user_id`).
- ❌ Con: Inconsistent with `courses.owner_email` and `copilot_conversations.owner_email` — the tables most closely related to Drive folders.
- ❌ Con: Requires wiring `token.sub` into the session (already done for units, but adds coupling to that specific auth callback shape).
- ❌ Con: Deepens the divergence in the opposite direction — now three tables use email and two use sub.

### Option C: Derive ownership from `courses.owner_email` via join

- ✅ Pro: No new column — ownership is transitive.
- ❌ Con: `drive_folders` has no FK to `courses`. Adding one changes the data model significantly.
- ❌ Con: Drive folders are not 1:1 with courses — they represent a folder hierarchy (root, grade, quarter, subject) that spans all courses. Ownership cannot be derived from a single course.
- ❌ Con: Every query requires a join, coupling Drive folder access to the courses schema.

## Implementation notes

- **Migration:** `drizzle/0008_add_owner_email_to_drive_folders.sql` — adds `owner_email text`, drops `uq_drive_folders_key`, adds `uq_drive_folders_key_owner UNIQUE NULLS NOT DISTINCT (folder_key, owner_email)`.
- **Schema:** `src/db/schema/drive-folders.ts` — `ownerEmail: text("owner_email")`, unique constraint updated to `(folderKey, ownerEmail)`.
- **API route hardened:** `src/app/api/drive/setup/route.ts` — extracts `ownerEmail` from session, returns 401 if missing, scopes SELECT/UPDATE WHERE and INSERT values by `ownerEmail`.
- **Tests:** `tests/api/drive/setup.test.ts` — 6 tests covering: 401 (no session), 401 (no email), SELECT scoped by ownerEmail, UPDATE WHERE scoped by ownerEmail, INSERT includes ownerEmail, session B cannot touch session A rows.
- **Backfill (manual, post-deploy):** `UPDATE drive_folders SET owner_email = '<teacher-email>' WHERE owner_email IS NULL;`
- **Follow-up — identity convergence:** When a `users` table is introduced, all ownership columns (`courses.owner_email`, `copilot_conversations.owner_email`, `drive_folders.owner_email`, `units.user_id`) must converge to `owner_id uuid REFERENCES users(id)`.

## Links

- [Issue #478](https://github.com/jaetill/ai-teacher/issues/478) — the data-isolation bug this addresses.
- [ADR-0021](0021-course-ownership-column.md) — prior art: `owner_email` on `courses`.
- [ADR-0022](0022-copilot-conversation-ownership-column.md) — prior art: `owner_email` on `copilot_conversations`.
- [ADR-0023](0023-unit-ownership-user-id-column.md) — divergent pattern: `user_id` on `units`.
- [ADR-0001](0001-platform-adoption.md) — platform adoption; notes auth is TBD.
- [PostgreSQL NULLS NOT DISTINCT](https://www.postgresql.org/docs/15/ddl-constraints.html#DDL-CONSTRAINTS-UNIQUE-CONSTRAINTS) — the unique-constraint modifier used for NULL handling.
