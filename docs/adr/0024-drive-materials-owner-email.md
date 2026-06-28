# ADR-0024: Drive folder and material ownership — `owner_email` column

- **Status:** Accepted
- **Date:** 2026-06-28
- **Deciders:** Jason
- **Tags:** schema, security, authorization

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled.

## Context and Problem Statement

`drive/setup`, `drive/import`, `upload/check-duplicates`, and `upload/file` all read from and write to the `drive_folders` and `materials` tables without any user-scoping filter. In a multi-user deployment an authenticated user can query, modify, or build curriculum from another user's Drive folder mappings and uploaded materials — a classic IDOR (issue #121).

ADR-0021 and ADR-0022 established a nullable `owner_email text` column pattern for `courses` and `copilot_conversations`. This ADR extends that pattern to `drive_folders` and `materials`.

## Decision Drivers

- **Security.** IDOR on all four Drive/upload endpoints must be closed.
- **Consistency.** `courses` and `copilot_conversations` already use `owner_email`; following the same pattern avoids a second identity system on these tables.
- **Migration safety.** Pre-auth rows carry no ownership data; the column must be nullable to avoid locking out existing data.
- **Identity stability.** Noted risk: Google allows email address changes, which would orphan rows. Accepted for now — same as ADR-0021/0022. When a `users` table lands, all `owner_email` columns across the schema converge to `owner_id uuid REFERENCES users(id)`.

## Considered Options

- **Option A:** Add nullable `owner_email text` column (matching ADR-0021/0022 pattern)
- **Option B:** Derive ownership transitively — materials via `drive_folders`, folders via Google Drive folder ID
- **Option C:** Add `user_id text` (OAuth `sub`) matching ADR-0023 units pattern

## Decision Outcome

Chosen option: **Option A — nullable `owner_email text` matching ADR-0021/0022**, because it is consistent with the two largest existing tables, ships immediately, and leaves legacy rows accessible without a backfill step.

Null-handling policy is **open-null**: routes skip the `ownerEmail` filter when `ownerEmail` is null (i.e., a legacy row is accessible to any authenticated user). This matches the single-tenant deployment reality and is acceptable until a `users` table enforces hard ownership.

## Consequences

### Positive

- IDOR closed on all four endpoints.
- Consistent with `courses.owner_email` and `copilot_conversations.owner_email`.
- Zero-downtime `ALTER TABLE ADD COLUMN` — no `NOT NULL` constraint.
- Legacy rows remain accessible; no data migration required before deploy.

### Negative

- `owner_email` inherits the email-change fragility documented in ADR-0021: if a teacher renames their Google account, their Drive folder mappings and uploaded materials become inaccessible.
- Open-null policy means any authenticated user can still access legacy (pre-fix) rows. The migration window should be short in production.
- Three identity systems now exist in the schema: `owner_email` (courses, copilot, drive_folders, materials), `user_id`/sub (units). Converging to `owner_id uuid` remains a follow-up obligation.

### Neutral

- Columns are nullable by design — intentional for backward compatibility, not permanent.
- The unique constraint on `drive_folders.folder_key` is widened to `(folder_key, owner_email)` to allow two users to each maintain a `root` folder without colliding. Postgres treats NULLs as distinct in unique indexes, so legacy rows with `owner_email IS NULL` remain uniquely constrained by `folder_key` alone.

## Pros and Cons of the Options

### Option A: Nullable `owner_email text` (ADR-0021/0022 pattern)

- ✅ Consistent with existing tables.
- ✅ Ships without a `users` table or FK dependency.
- ✅ Open-null keeps legacy data accessible.
- ❌ Email-change fragility (documented in ADR-0021).
- ❌ Adds a fourth table to the `owner_email` system while `units` uses `user_id`.

### Option B: Transitive ownership via Drive folder ID / courses FK

- ✅ No new column — ownership derived from the Drive folder structure.
- ❌ Drive folder IDs are not a user-identity primitive; two users could share a folder.
- ❌ `materials` has no guaranteed link to a course or Drive folder in all storage types.
- ❌ Every ownership check requires a join — coupling these tables to upstream schemas.

### Option C: `user_id text` (OAuth `sub`, ADR-0023 pattern)

- ✅ Immutable identity claim — no email-change risk.
- ❌ Inconsistent with `courses` and `copilot_conversations` which already use `owner_email`.
- ❌ Widening the identity divergence (three systems instead of two).

## Implementation notes

- **Migration:** `drizzle/0008_add_owner_email_drive_materials.sql`
  - `ALTER TABLE "drive_folders" ADD COLUMN "owner_email" text`
  - `ALTER TABLE "materials" ADD COLUMN "owner_email" text`
  - Drop `uq_drive_folders_key`, add `uq_drive_folders_key_owner` on `(folder_key, owner_email)`
  - Add `idx_drive_folders_owner_email`
- **Schema:** `src/db/schema/drive-folders.ts`, `src/db/schema/materials.ts`
- **Auth helper:** `src/lib/auth-helpers.ts` — `getUserEmail()` returns `session.user.email ?? null`; all four routes call this and return 401 if the result is null.
- **Routes hardened:** all four routes now filter reads with `eq(driveFolders.ownerEmail, ownerEmail)` / `eq(materials.ownerEmail, ownerEmail)` (inside `and()` alongside existing key filters) and stamp writes with `ownerEmail`.
- **Tests:** `tests/api/drive-upload-owner-scoping.test.ts` — covers 401 (unauthenticated + no-email session), ownerEmail filter present in WHERE, ownerEmail stamped on INSERT, for all four routes.
- **Follow-up — unique constraint and open-null window:** once all drive_folders rows have `owner_email` populated, tighten to `NOT NULL` and add a partial index. Track in a separate issue.
- **Follow-up — identity convergence:** when a `users` table lands, migrate `owner_email` → `owner_id uuid FK` across all tables.

## Links

- [OWASP IDOR](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/05-Authorization_Testing/04-Testing_for_Insecure_Direct_Object_References)
- [Issue #121](https://github.com/jaetill/ai-teacher/issues/121) — original IDOR report
- [Issue #139](https://github.com/jaetill/ai-teacher/issues/139) — test-coverage gap that triggered this ADR
- [PR #131](https://github.com/jaetill/ai-teacher/pull/131) — prior attempt; closed pending this ADR
- [ADR-0021](0021-course-ownership-column.md) — prior art: `owner_email` on `courses`
- [ADR-0022](0022-copilot-conversation-ownership-column.md) — prior art: `owner_email` on `copilot_conversations`
- [ADR-0023](0023-unit-ownership-user-id-column.md) — `user_id` (sub) on `units`; documents divergence rationale
