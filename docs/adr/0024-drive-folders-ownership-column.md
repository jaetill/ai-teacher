# ADR-0024: Drive folder ownership — `owner_email` column on `drive_folders` table

- **Status:** Proposed
- **Date:** 2026-06-26
- **Deciders:** Jason
- **Tags:** schema, security, authorization

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

The `drive_folders` table maps logical folder keys (e.g. `grade_8_Q1_Curriculum`) to Google Drive folder IDs. Before this change, queries filtered only by `folder_key` with a unique constraint on that column alone. In a multi-teacher deployment, teacher B could read teacher A's Drive folder mappings by hitting any endpoint that resolves folder keys — the `WHERE folder_key = ?` predicate returned whichever teacher's row was inserted first (cross-teacher IDOR, issue #428).

Additionally, the single-column unique constraint on `folder_key` meant only one teacher could own a given logical key. A second teacher running `/api/drive/setup` would hit a unique-constraint violation instead of getting their own folder tree.

How should we scope `drive_folders` rows to the owning teacher so that folder-key lookups are tenant-isolated and multiple teachers can each have their own folder hierarchy?

## Decision Drivers

- **Security.** Eight API routes query `drive_folders` by `folder_key` without an ownership predicate — all are IDOR vectors in a multi-teacher deployment.
- **Consistency with ADR-0021/0022.** `courses` and `copilot_conversations` already use nullable `owner_email text` columns. Using the same pattern keeps the eventual `users`-table migration uniform.
- **Unique constraint correctness.** The current `UNIQUE(folder_key)` is semantically wrong for multi-teacher — two teachers must be able to have the same logical folder key pointing to different Drive folders.
- **Backward compatibility.** Existing rows have no ownership data. The migration must be non-blocking and must not orphan legacy rows.
- **Schema evolution.** Same as ADR-0021: the column should be replaceable with an FK to a future `users` table.

## Considered Options

- **Option A:** Add nullable `owner_email text` column, widen unique constraint to `(folder_key, owner_email)`, scope all queries by session email
- **Option B:** Derive ownership from the related `courses.owner_email` via joins — no new column on `drive_folders`
- **Option C:** Create a `users` table now, add `owner_id uuid` FK to `drive_folders`
- **Option D:** Use `user_id` (OAuth `sub`) instead of `owner_email`, matching ADR-0023's pattern on `units`

## Decision Outcome

Chosen option: **Option A — nullable `owner_email` text column with widened unique constraint**, because it closes the IDOR across all eight affected routes with a single migration, maintains consistency with the `owner_email` pattern established in ADR-0021 and ADR-0022, and correctly allows multiple teachers to own the same logical folder keys.

## Consequences

### Positive

- **IDOR closed across eight routes.** All `drive_folders` queries now include `eq(driveFolders.ownerEmail, userEmail)`, preventing cross-teacher data access: `drive/setup`, `drive/import`, `upload/file`, `upload/check-duplicates`, `curriculum/editor/pool`, `import/build-curriculum`, `units/[id]`, `units/[id]/link-materials`.
- **Correct multi-teacher semantics.** `UNIQUE(folder_key, owner_email)` allows each teacher to have their own complete folder tree without constraint violations.
- **Consistent ownership pattern.** Same column name and type as ADR-0021 (`courses`) and ADR-0022 (`copilot_conversations`), keeping the future `users`-table migration path uniform for three of four ownership columns.
- **Zero-downtime migration.** The migration is three statements: `ADD COLUMN`, `DROP CONSTRAINT`, `ADD CONSTRAINT` — all non-blocking on PostgreSQL for the current data volume.

### Negative

- **Denormalized identity.** Email is duplicated across folder rows rather than normalized into a `users` table. Same fragility as ADR-0021 if a teacher changes their Google email.
- **Backfill required.** Existing rows have `owner_email = NULL`. The widened unique constraint `(folder_key, owner_email)` treats `NULL` as distinct per SQL semantics, so legacy rows won't conflict, but they also won't match any authenticated query — the teacher must re-run `/api/drive/setup` or receive a manual `UPDATE` backfill.
- **Identity claim divergence with ADR-0023.** `drive_folders` uses `owner_email` while `units` uses `user_id` (OAuth `sub`). This is consistent with ADR-0021/0022 but inconsistent with ADR-0023 — the two-identity-system debt grows to cover four tables.

### Neutral

- **Column is nullable.** Intentional for backward compatibility, same as ADR-0021/0022/0023. Will become `NOT NULL` (or be replaced by an FK) when the `users` table lands.
- **No explicit null-safety guard in application code.** Unlike ADR-0022's fail-closed pattern, this PR relies on routes validating `session.user?.email` is present (returning 401 if not) before using it in queries. The `eq(ownerEmail, userEmail)` predicate naturally excludes `NULL` rows because `NULL = 'x'` is `false` in SQL.

## Pros and Cons of the Options

### Option A: Nullable `owner_email` text column, widened unique constraint

- ✅ Pro: Ships immediately — one migration, closes IDOR across all eight routes.
- ✅ Pro: Consistent with the `owner_email` pattern in ADR-0021 and ADR-0022.
- ✅ Pro: Correctly models multi-teacher folder ownership via `UNIQUE(folder_key, owner_email)`.
- ❌ Con: Denormalized — email duplicated across rows.
- ❌ Con: Fragile if email changes (mitigated: Google Workspace emails are stable).
- ❌ Con: Diverges from ADR-0023's `user_id` (sub) claim on `units`.

### Option B: Derive ownership from `courses.owner_email` via joins

- ✅ Pro: No new column — ownership is transitive through the course that uses the folder.
- ❌ Con: `drive_folders` are created during `/api/drive/setup` before any course exists — the join path doesn't exist at folder-creation time.
- ❌ Con: Folder keys like `root` and `standards` are not course-specific — no FK path exists.
- ❌ Con: Every folder-key lookup becomes a multi-table join, coupling folder resolution to the courses schema.

### Option C: Create `users` table now, add `owner_id` FK

- ✅ Pro: Normalized from day one — resolves the identity-claim divergence.
- ❌ Con: Same objections as ADR-0021/0022 Option B — premature commitment before auth is settled.
- ❌ Con: Blocks the security fix behind a larger migration and upsert-on-login logic.

### Option D: Use `user_id` (OAuth `sub`) instead of `owner_email`

- ✅ Pro: Consistent with ADR-0023 on `units` — uses the immutable OAuth `sub` claim.
- ✅ Pro: No email-change fragility.
- ❌ Con: Inconsistent with ADR-0021/0022 on `courses` and `copilot_conversations` — introduces a third pattern rather than aligning with the majority.
- ❌ Con: `drive/setup` already has `session.user.email` readily available; `session.user.id` requires the `token.sub` wiring from ADR-0023 which not all routes import yet.
- ❌ Con: The eventual `users`-table migration will unify both claims anyway; aligning with the majority pattern (email) minimizes interim divergence.

## Implementation notes

- **Migration:** `drizzle/0008_add_drive_folders_owner_email.sql` — `ALTER TABLE ADD COLUMN "owner_email" text`, `DROP CONSTRAINT "uq_drive_folders_key"`, `ADD CONSTRAINT "uq_drive_folders_key" UNIQUE("folder_key","owner_email")`.
- **Schema:** `src/db/schema/drive-folders.ts` — `ownerEmail: text("owner_email")`, unique constraint widened to `(table.folderKey, table.ownerEmail)`.
- **Routes hardened (8 total):**
  - `src/app/api/drive/setup/route.ts` — inserts `ownerEmail` on new rows, scopes upsert lookups.
  - `src/app/api/drive/import/route.ts` — scopes folder-key lookup.
  - `src/app/api/upload/file/route.ts` — scopes folder-key lookup.
  - `src/app/api/upload/check-duplicates/route.ts` — scopes folder-key lookup.
  - `src/app/api/curriculum/editor/pool/route.ts` — scopes folder-key lookup.
  - `src/app/api/import/build-curriculum/route.ts` — scopes folder-key lookup.
  - `src/app/api/units/[id]/route.ts` — scopes folder-key lookup.
  - `src/app/api/units/[id]/link-materials/route.ts` — scopes folder-key lookup.
- **Email validation added:** Routes that didn't already extract `session.user.email` now do so with a 401 guard (`drive/import`, `upload/file`, `upload/check-duplicates`, `units/[id]/link-materials`).
- **Tests:** `tests/api/curriculum/editor/pool.test.ts` — new test asserting `eq(ownerEmail, sessionEmail)` is present in the `driveFolders` WHERE clause. `tests/api/import/build-curriculum.test.ts` — mock updated for `ownerEmail` column.
- **Backfill (recommended post-deploy):** `UPDATE drive_folders SET owner_email = '<teacher-email>' WHERE owner_email IS NULL;`
- **Follow-up — identity convergence:** When a `users` table is introduced, all four ownership columns (`courses.owner_email`, `copilot_conversations.owner_email`, `drive_folders.owner_email`, `units.user_id`) must be migrated to `owner_id uuid REFERENCES users(id)`.

## Links

- [OWASP IDOR](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/05-Authorization_Testing/04-Testing_for_Insecure_Direct_Object_References) — the vulnerability class this addresses.
- [Issue #428](https://github.com/jaetill/ai-teacher/issues/428) — the cross-teacher IDOR report.
- [ADR-0021](0021-course-ownership-column.md) — prior art: `owner_email` on `courses`.
- [ADR-0022](0022-copilot-conversation-ownership-column.md) — prior art: `owner_email` on `copilot_conversations`, fail-closed null policy.
- [ADR-0023](0023-unit-ownership-user-id-column.md) — divergent prior art: `user_id` (OAuth `sub`) on `units`.
- [ADR-0001](0001-platform-adoption.md) — platform adoption; notes auth is TBD.
