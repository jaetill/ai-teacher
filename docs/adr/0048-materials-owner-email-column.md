# ADR-0048: Materials ownership — `owner_email` column on `materials` table

- **Status:** Proposed
- **Date:** 2026-07-31
- **Deciders:** Jason (product owner), Claude (architect review)
- **Tags:** schema, security

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

The `materials` table has no ownership column. Determining who owns a material requires joining through `drive_folders` on `drive_folder_id` and reading that table's `owner_email` — an indirect, fragile hop that every read-path route would need to repeat. Issue #566 (the materials read-path IDOR sweep across 12 routes) is blocked until materials carry their own ownership data, because scoping reads through a folder join on every route is error-prone and slow.

ADR-0021 (`courses`), ADR-0022 (`copilot_conversations`), and ADR-0044 (`drive_folders`) established a nullable `owner_email text` column as the project's ownership pattern. Should `materials` follow the same pattern, and how should existing rows be handled?

## Decision Drivers

- **Security.** Issue #566 (read-path IDOR sweep) needs a direct ownership predicate on `materials` — inferring ownership through folder joins is not viable for 12 routes.
- **Consistency with ADR-0021/0022/0044.** Three other tables already use nullable `owner_email text`. A fourth table following the same pattern keeps the eventual `users`-table migration uniform.
- **Write-path completeness.** All three insert paths (upload/file, drive/import, copilot/accept-draft) must stamp the column so that no new rows are created without ownership.
- **Legacy-row compatibility.** Pre-migration rows have no ownership data. The column must be nullable, and read paths must treat `NULL` as legacy-shared (open-null policy), consistent with `drive_folders` (ADR-0044).
- **Migration safety.** The `materials` table is small (hundreds of rows). An additive `ALTER TABLE ADD COLUMN` + `CREATE INDEX` is non-blocking and safe to run without a maintenance window.

## Considered Options

- Option A: Add a nullable `owner_email text` column directly on `materials`
- Option B: Infer ownership at query time by joining through `drive_folders.owner_email`
- Option C: Create a `users` table now and add `owner_id uuid` FK

## Decision Outcome

Chosen option: **Option A**, because it gives every material a direct ownership predicate for the upcoming read-path sweep (#566), follows the established pattern from three prior ADRs, and avoids the join overhead and coupling of the folder-inference approach.

## Consequences

### Positive

- **Unblocks #566.** The 12 read-path routes can now scope materials by `owner_email` directly, without joining through `drive_folders`.
- **All insert paths stamp ownership.** Upload, Drive import, and copilot accept-draft all set `ownerEmail` — no new rows are created without an owner.
- **Consistent with the ownership pattern.** Fourth table using `owner_email text`, keeping the future `users`-table migration scope predictable (four columns to convert, all the same shape).
- **Indexed for read-path performance.** `idx_materials_owner_email` supports the scoped queries that #566 will add.

### Negative

- **Denormalized identity.** Same email-duplication concern as ADR-0021/0022/0044 — if a teacher's Google email changes, rows must be updated across four tables. Mitigated: Google Workspace emails are stable.
- **Legacy rows require backfill.** Existing rows have `owner_email = NULL` and are accessible to any authenticated user under the open-null policy until backfilled. The backfill joins `materials.drive_folder_id` to `drive_folders.owner_email` and runs as a one-off script against production.

### Neutral

- **Column is nullable by design.** Same convention as the other three ownership columns. Will become `NOT NULL` (or be replaced by an FK) when a `users` table lands and all rows are backfilled.
- **Read-path hardening is out of scope.** This PR lands the data model; the 12-route sweep (#566) is a separate PR that depends on this column existing.

## Pros and Cons of the Options

### Option A: Nullable `owner_email` text column on `materials`

- ✅ Pro: Direct ownership predicate — no joins needed for read-path scoping
- ✅ Pro: Consistent with ADR-0021/0022/0044 (four tables, one pattern)
- ✅ Pro: Simple migration — one `ADD COLUMN`, one `CREATE INDEX`
- ✅ Pro: All three insert paths already have the session email in scope
- ❌ Con: Denormalized; email changes require multi-table updates

### Option B: Infer ownership via `drive_folders` join

- ✅ Pro: No schema change; no migration
- ❌ Con: Every read-path route needs a join through `drive_folders` — 12 routes, each with an extra query or subquery
- ❌ Con: Materials without a `drive_folder_id` (e.g., future direct uploads) have no ownership path
- ❌ Con: Couples materials authorization to the Drive integration

### Option C: Create `users` table now, add `owner_id uuid` FK

- ✅ Pro: Immutable identity; eliminates email-change fragility across all tables
- ❌ Con: Requires building the `users` table, backfilling all four ownership columns, and wiring `token.sub` through the auth stack — far larger scope than the security fix warrants
- ❌ Con: Delays #566 (the active IDOR sweep) behind a multi-sprint infrastructure project

## Implementation notes

- **Migration:** `drizzle/0010_materials_owner_email.sql` — `ALTER TABLE "materials" ADD COLUMN "owner_email" text;` + `CREATE INDEX "idx_materials_owner_email" ON "materials" USING btree ("owner_email");`
- **Schema:** `src/db/schema/materials.ts` — `ownerEmail: text("owner_email")` + index definition
- **Insert paths stamped (3 total):**
  - `src/app/api/upload/file/route.ts` — sets `ownerEmail` from session
  - `src/app/api/drive/import/route.ts` — sets `ownerEmail` from session
  - `src/app/api/copilot/accept-draft/route.ts` — sets `ownerEmail` from session
- **Tests:** Insert-stamping assertions added to `tests/api/upload/file.test.ts`, `tests/api/drive/import.test.ts`, `tests/api/copilot/accept-draft.test.ts`
- **Backfill (separate, not in this PR):** `UPDATE materials m SET owner_email = df.owner_email FROM drive_folders df WHERE m.drive_folder_id = df.drive_id AND m.owner_email IS NULL;`
- **Follow-up — read-path sweep:** Issue #566 — 12 routes to scope by `owner_email`. Depends on this column.
- **Follow-up — identity convergence:** When a `users` table is introduced, all four ownership columns (`courses.owner_email`, `copilot_conversations.owner_email`, `drive_folders.owner_email`, `materials.owner_email`) must converge to `owner_id uuid REFERENCES users(id)`.

## Links

- [Issue #554](https://github.com/jaetill/ai-teacher/issues/554) — upload/file ownership stamping
- [Issue #537](https://github.com/jaetill/ai-teacher/issues/537) — drive/import ownership stamping
- [Issue #566](https://github.com/jaetill/ai-teacher/issues/566) — read-path IDOR sweep (depends on this column)
- [ADR-0021](0021-course-ownership-column.md) — prior art: `owner_email` on `courses`
- [ADR-0022](0022-copilot-conversation-ownership-column.md) — prior art: `owner_email` on `copilot_conversations`
- [ADR-0044](0044-drive-folders-owner-email-scope.md) — prior art: `owner_email` on `drive_folders`
- [OWASP IDOR](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/05-Authorization_Testing/04-Testing_for_Insecure_Direct_Object_References) — the vulnerability class this supports closing
