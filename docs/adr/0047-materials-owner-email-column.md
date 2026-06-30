# ADR-0047: Materials ownership — `owner_email` column on `materials`

- **Status:** Proposed
- **Date:** 2026-06-29
- **Deciders:** Jason
- **Tags:** schema, security, authorization

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

The `materials` table stores uploaded and Drive-imported teaching materials but has no ownership column. Two endpoints are affected:

1. `POST /api/drive/import` inserts materials rows without recording who imported them.
2. `POST /api/upload/check-duplicates` queries materials by `driveFolderId` with no ownership predicate — any authenticated user can see whether another teacher already has a file with a given name, a classic IDOR (issue #537).

ADR-0021, ADR-0022, ADR-0023, and ADR-0044 established a nullable `owner_email` column pattern on `courses`, `copilot_conversations`, `units`, and `drive_folders` respectively. Should `materials` follow the same pattern?

## Decision Drivers

- **Security.** The IDOR on `check-duplicates` must be closed; materials inserts must be attributable to a specific user.
- **Consistency with prior ownership ADRs.** Four tables already use `owner_email` (or `user_id` in the case of `units`). Using the same column name and identity claim reduces cognitive load.
- **Query performance.** `check-duplicates` filters materials by `driveFolderId` and now also by `ownerEmail`. An index on `owner_email` supports efficient filtering as the materials table grows.
- **Legacy-row compatibility.** Pre-auth rows have no owner. The column must be nullable, and queries must handle NULLs gracefully.

## Considered Options

- **Option A: `owner_email` text column** — consistent with ADR-0021/0022/0044
- **Option B: `user_id` text column** — consistent with ADR-0023 (units)
- **Option C: No schema change** — enforce ownership at the application layer only (join through `drive_folders`)

## Decision Outcome

Chosen option: **Option A — `owner_email` text column**, because it keeps 4-of-5 ownership tables on the same identity claim (`owner_email`), uses the claim already available on the NextAuth session object, and requires no additional wiring. The column is nullable to preserve backward compatibility with existing rows, following the established open-null policy from ADR-0044.

## Consequences

### Positive

- **IDOR closed on `check-duplicates`.** The query now includes `eq(materials.ownerEmail, ownerEmail)` (with an `isNull` fallback for legacy rows), preventing cross-user material visibility.
- **Provenance on insert.** `drive/import` stamps the caller's email on every materials row, enabling future audit and per-user material management.
- **Consistent with ADR-0021/0022/0044.** Same column name, same identity claim, same nullable pattern — the fifth table in the series.
- **Indexed for performance.** `idx_materials_owner` supports the new predicate without table scans.

### Negative

- **Denormalized identity.** Same email-change fragility as ADR-0021 — if a teacher's Google email changes, all their materials rows need updating. Mitigated: Google Workspace emails are stable.
- **Open-null is less secure than fail-closed.** Legacy materials rows (where `owner_email IS NULL`) are visible to any authenticated user. Acceptable for the current single-teacher deployment; should be closed by backfilling post-deploy.

### Neutral

- **Column is nullable by design.** Will become `NOT NULL` (or be replaced by an FK) when a `users` table lands and all rows are backfilled — same trajectory as every other ownership column.
- **No unique-constraint change.** Unlike `drive_folders` (ADR-0044) and `courses` (ADR-0045), `materials` does not use a natural-key unique constraint that needs scoping. The primary key remains the existing `id` column.
- **Two identity systems persist.** `materials`, `courses`, `copilot_conversations`, and `drive_folders` use `owner_email`; `units` uses `user_id`. Convergence is deferred to the future `users` table.

## Pros and Cons of the Options

### Option A: `owner_email` text column (chosen)

- ✅ Pro: Consistent with 3 of the 4 existing ownership columns (ADR-0021/0022/0044); the claim is already on the NextAuth session
- ✅ Pro: Simple — one new column, one index, two route changes
- ❌ Con: Inherits email-change fragility; diverges from ADR-0023's `user_id`

### Option B: `user_id` text column

- ✅ Pro: Immutable; closer to an eventual FK on a `users` table; consistent with ADR-0023
- ❌ Con: Inconsistent with 3 of the 4 existing ownership columns; requires `token.sub` wiring that isn't currently plumbed into the Drive/upload routes

### Option C: No schema change — join through `drive_folders`

- ✅ Pro: Zero migration; leverages ADR-0044's existing `owner_email` on `drive_folders`
- ❌ Con: Requires a join on every `check-duplicates` query; does not solve the insert-provenance problem; materials that exist outside Drive folders have no ownership path

## Implementation notes

- **Migration:** `drizzle/0011_materials_owner_email.sql` — `ALTER TABLE "materials" ADD COLUMN "owner_email" text;` + `CREATE INDEX "idx_materials_owner" ON "materials" ("owner_email");`.
- **Schema:** `src/db/schema/materials.ts` — `ownerEmail: text("owner_email")` + index definition.
- **Routes hardened (2):**
  - `src/app/api/drive/import/route.ts` — stamps `ownerEmail` on the materials insert.
  - `src/app/api/upload/check-duplicates/route.ts` — scopes the materials `inArray` query with `and(inArray(...), or(eq(ownerEmail, email), isNull(ownerEmail)))`.
- **Tests:** `tests/api/drive/import.test.ts` (ownerEmail stamp assertion) + `tests/api/upload/check-duplicates.test.ts` (cross-user isolation regression test).
- **Backfill (recommended post-deploy):** `UPDATE materials SET owner_email = '<teacher-email>' WHERE owner_email IS NULL;`
- **Follow-up — identity convergence:** When a `users` table is introduced, all five ownership columns must converge to `owner_id uuid REFERENCES users(id)`.

## Links

- [OWASP IDOR](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/05-Authorization_Testing/04-Testing_for_Insecure_Direct_Object_References) — the vulnerability class this addresses.
- [Issue #537](https://github.com/jaetill/ai-teacher/issues/537) — the materials IDOR report.
- [ADR-0021](0021-course-ownership-column.md) — prior art: `owner_email` on `courses`.
- [ADR-0022](0022-copilot-conversation-ownership-column.md) — prior art: `owner_email` on `copilot_conversations`.
- [ADR-0023](0023-unit-ownership-user-id-column.md) — prior art: `user_id` on `units`.
- [ADR-0044](0044-drive-folders-owner-email-scope.md) — prior art: `owner_email` on `drive_folders`.
- [ADR-0045](0045-scope-courses-unique-constraint-to-owner.md) — prior art: scoped unique constraint on `courses`.
