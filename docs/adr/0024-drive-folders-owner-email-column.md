# ADR-0024: Drive-folders ownership — `owner_email` column on `drive_folders` table

- **Status:** Proposed
- **Date:** 2026-06-26
- **Deciders:** Jason
- **Tags:** schema, security, authorization

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

The `drive_folders` table had a unique constraint on `folder_key` alone. Because folder keys are deterministic strings derived from grade and quarter (e.g. `grade_6_Q1_Curriculum`), two teachers who both run `/api/drive/setup` for the same grade would collide: the second teacher's `INSERT` would conflict on the existing key, or — worse — queries in endpoints like `/api/curriculum/editor/pool` and `/api/upload/file` would silently return another teacher's Google Drive folder ID (issue #427).

How should the `drive_folders` schema be changed so that folder records are scoped per user, and how should all consuming queries be updated to enforce that scope?

## Decision Drivers

- **Security.** Folder-key collision is an authorization bypass — one teacher can read/write materials into another teacher's Google Drive folder. This is an IDOR in the Drive integration layer.
- **Consistency with prior ownership columns.** ADR-0021 established `owner_email text` on `courses`; ADR-0022 did the same on `copilot_conversations`. Reusing the same claim keeps the identity model uniform across these tables, even though ADR-0023 introduced `user_id` (OAuth `sub`) on `units`.
- **Migration safety.** Pre-existing rows have no `owner_email`. The column must be nullable to avoid a destructive migration. The unique constraint change must handle existing rows gracefully.
- **Query-site completeness.** Every endpoint that reads or writes `drive_folders` must be updated in a single PR — a partial fix would leave some routes vulnerable.

## Considered Options

- **Option A:** Add nullable `owner_email text` column, widen unique constraint to `(folder_key, owner_email)`, scope all queries by `ownerEmail`
- **Option B:** Add nullable `user_id text` column (OAuth `sub`, matching ADR-0023 pattern on `units`)
- **Option C:** Prefix `folder_key` with the user's email at write time (e.g. `teacher@school.edu:grade_6_Q1_Curriculum`) — no schema change

## Decision Outcome

Chosen option: **Option A — nullable `owner_email` column with widened unique constraint**, because it closes the IDOR immediately, is consistent with the identity claim used in ADR-0021 and ADR-0022 for `courses` and `copilot_conversations`, and avoids encoding ownership inside a data value (Option C).

## Consequences

### Positive

- **IDOR closed.** Two teachers with the same grade/quarter combination now have independent folder records. All eight query sites are scoped by `ownerEmail`.
- **Consistent identity claim.** `drive_folders.owner_email` matches `courses.owner_email` and `copilot_conversations.owner_email`, keeping the join model simple for cross-table queries.
- **Zero-downtime migration.** `ALTER TABLE ADD COLUMN` (nullable) + `DROP CONSTRAINT` + `ADD CONSTRAINT` is non-blocking on the current dataset size.

### Negative

- **Identity-claim divergence persists.** `units.user_id` (ADR-0023) uses OAuth `sub`; this table uses `email`. The mismatch is inherited technical debt that must be resolved when a `users` table is introduced.
- **Email-change fragility.** If a teacher changes their Google account email, their `drive_folders` rows become orphaned. Same risk documented in ADR-0021.
- **Nullable column in unique constraint.** PostgreSQL treats each `(folder_key, NULL)` pair as distinct, so pre-existing rows without `owner_email` will not conflict with new rows. However, two legacy `NULL`-email rows with the same `folder_key` can coexist, which is inconsistent. A backfill is needed to close this gap.

### Neutral

- **No null-handling policy decision required.** Unlike ADR-0022 (fail-closed) or ADR-0023 (open-null), every query site in this PR already extracts `ownerEmail` from the session and uses `eq(driveFolders.ownerEmail, ownerEmail)`. Legacy rows with `NULL` owner will simply not match any authenticated query — effectively fail-closed without an explicit 403 branch.
- **Unique constraint name unchanged.** The constraint remains `uq_drive_folders_key` — same name, wider scope. No downstream migration references to update.

## Pros and Cons of the Options

### Option A: Nullable `owner_email` column, widened unique constraint

- ✅ Pro: Consistent with ADR-0021/0022 identity claim — same column name, same type, same join semantics.
- ✅ Pro: All eight query sites updated in one PR — no partial-fix window.
- ✅ Pro: Zero-downtime migration; nullable column avoids table rewrite.
- ❌ Con: Inherits email-change fragility from ADR-0021.
- ❌ Con: Diverges from ADR-0023's `user_id` (sub) choice — two identity systems in the database.

### Option B: Nullable `user_id` column (OAuth `sub`)

- ✅ Pro: Stable identity claim — `sub` is immutable, matching ADR-0023.
- ✅ Pro: Would unify `units` and `drive_folders` on the same claim.
- ❌ Con: Inconsistent with `courses.owner_email` and `copilot_conversations.owner_email` — three tables use email, one uses sub, this would make it two-and-two.
- ❌ Con: Requires wiring `token.sub` through to all eight Drive-related routes, which currently only access `session.user.email`.

### Option C: Prefix `folder_key` with user email

- ✅ Pro: No schema change — no migration, no constraint modification.
- ❌ Con: Embeds identity inside a data value — harder to query, index, and migrate.
- ❌ Con: Breaks all existing `folder_key` references unless a backfill rewrites every row.
- ❌ Con: Existing unique constraint would still apply, so the fix is self-defeating without also changing the constraint.

## Implementation notes

- **Migration:** `drizzle/0008_add_owner_email_to_drive_folders.sql` — adds `owner_email text`, drops and recreates `uq_drive_folders_key` as `UNIQUE(folder_key, owner_email)`.
- **Schema:** `src/db/schema/drive-folders.ts` — `ownerEmail: text("owner_email")`, unique constraint widened.
- **Query sites updated (8 routes):**
  - `src/app/api/curriculum/editor/pool/route.ts`
  - `src/app/api/drive/import/route.ts`
  - `src/app/api/drive/setup/route.ts`
  - `src/app/api/import/build-curriculum/route.ts`
  - `src/app/api/units/[id]/link-materials/route.ts`
  - `src/app/api/units/[id]/route.ts`
  - `src/app/api/upload/check-duplicates/route.ts`
  - `src/app/api/upload/file/route.ts`
- **Tests:** `tests/api/curriculum/editor/pool.test.ts` and `tests/api/import/build-curriculum.test.ts` — assert `ownerEmail` is passed to the query filter.
- **Backfill (recommended post-deploy):** `UPDATE drive_folders SET owner_email = '<teacher-email>' WHERE owner_email IS NULL;` — closes the nullable-unique-constraint gap.
- **Follow-up — identity convergence:** Same obligation as ADR-0021/0022/0023: when a `users` table is introduced, `owner_email` columns across all tables must converge to `owner_id uuid REFERENCES users(id)`.

## Links

- [OWASP IDOR](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/05-Authorization_Testing/04-Testing_for_Insecure_Direct_Object_References) — the vulnerability class this addresses.
- [Issue #427](https://github.com/jaetill/ai-teacher/issues/427) — cross-user folder collision report.
- [ADR-0021](0021-course-ownership-column.md) — prior art: `owner_email` on `courses`.
- [ADR-0022](0022-copilot-conversation-ownership-column.md) — prior art: `owner_email` on `copilot_conversations`.
- [ADR-0023](0023-unit-ownership-user-id-column.md) — divergent prior art: `user_id` on `units`.
