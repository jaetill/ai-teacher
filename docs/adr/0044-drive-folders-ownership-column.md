# ADR-0044: Drive folder ownership — `owner_email` column with NULLS NOT DISTINCT composite unique constraint

- **Status:** Proposed
- **Date:** 2026-06-27
- **Deciders:** Jason
- **Tags:** schema, security, authorization

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

The `drive_folders` table maps logical folder keys (e.g. `"root"`, `"grade_6_Q1_Lessons"`) to Google Drive folder IDs. It had a single-column unique constraint on `folder_key`, which enforced one folder-per-key across all users. Moving to multi-tenant ownership requires scoping the uniqueness to `(folder_key, owner_email)` so that each teacher can have their own folder tree without collisions.

Two sub-decisions are tightly coupled here: (1) which identity claim to use for ownership, and (2) how the unique constraint should handle NULL values in the new column during the migration window when legacy rows have no owner.

## Decision Drivers

- **Multi-tenant readiness.** Multiple teachers must each have their own Drive folder tree with identical logical keys (e.g. both have a `"root"` folder).
- **Constraint integrity during migration.** Legacy rows carry `owner_email = NULL`. PostgreSQL's default `NULLS DISTINCT` behavior treats every NULL as unique, so a composite `UNIQUE(folder_key, owner_email)` would silently allow duplicate `(same_key, NULL)` rows — defeating the uniqueness guarantee for the existing teacher.
- **Consistency with prior ownership ADRs.** ADR-0021 (`courses`) and ADR-0022 (`copilot_conversations`) use `owner_email`. ADR-0023 (`units`) diverged to `user_id`. The identity-claim choice should be deliberate.
- **Backward compatibility.** The migration must not break the running app; existing rows must remain queryable.

## Considered Options

This ADR bundles two sub-decisions:

- Sub-decision 1: Identity claim for the ownership column
- Sub-decision 2: Unique constraint strategy for `folder_key` uniqueness

## Decision Outcome

We chose the bundle:

- Sub-decision 1 → **`owner_email` (text)** — consistent with ADR-0021/0022
- Sub-decision 2 → **Composite `UNIQUE NULLS NOT DISTINCT (folder_key, owner_email)`** — replaces the old single-column constraint

The bundle is internally consistent because the choice of `owner_email` as the ownership column directly determines what participates in the composite unique constraint, and the NULLS NOT DISTINCT modifier is necessary specifically because `owner_email` is nullable during the migration window.

## Consequences

### Positive

- **Multi-tenant folder trees.** Each teacher gets their own namespace of folder keys, scoped by email.
- **Legacy row integrity preserved.** `NULLS NOT DISTINCT` prevents duplicate `(folder_key, NULL)` rows, keeping the uniqueness guarantee intact for pre-backfill rows.
- **Zero-downtime migration.** The three-statement migration (add column, drop old constraint, add new constraint) is safe on PostgreSQL — `ADD COLUMN` without `NOT NULL` is non-blocking, and constraint changes take brief `ACCESS EXCLUSIVE` locks on small tables.
- **Consistent identity claim.** Aligns with `courses.owner_email` and `copilot_conversations.owner_email` (ADR-0021/0022), keeping the majority of ownership columns on the same identity system.

### Negative

- **Identity-system divergence persists.** `units.user_id` (ADR-0023) uses OAuth `sub`, while this column uses `email`. The two-identity debt grows by one table and must be resolved when a `users` table is introduced.
- **Denormalized identity.** Same email-change fragility as ADR-0021 — if a teacher's Google email changes, `drive_folders` rows must be updated.
- **No index on `owner_email`.** The composite unique constraint indexes `(folder_key, owner_email)`, which does not help queries that filter by `owner_email` alone. Acceptable for the current single-teacher workload; a dedicated index may be needed for multi-teacher.

### Neutral

- **Column is nullable by design.** Intentional for backward compatibility with legacy single-tenant rows. When a `users` table lands and all rows are backfilled, the column (or its FK replacement) can be made `NOT NULL`.
- **Old constraint name (`uq_drive_folders_key`) removed.** Any code referencing the constraint by name (e.g. conflict-target clauses) must update to `uq_drive_folders_key_owner`. The Drizzle schema is the source of truth; raw SQL references, if any, must be found and updated.

## Pros and Cons of the Options

### Sub-decision 1: Identity claim

| Option | Pros | Cons |
|---|---|---|
| **`owner_email` (text)** (chosen) | Consistent with ADR-0021/0022; available directly from NextAuth session; human-readable in DB queries | Email-change fragility; diverges from ADR-0023's `user_id` |
| **`user_id` (text, OAuth `sub`)** | Immutable identity; consistent with ADR-0023 | Diverges from ADR-0021/0022 majority; not human-readable; deepens two-identity-system debt in a different direction |
| **`owner_id` (uuid FK to `users`)** | Normalized from day one | `users` table doesn't exist yet; blocks the fix behind a larger migration |

### Sub-decision 2: Unique constraint strategy

| Option | Pros | Cons |
|---|---|---|
| **`UNIQUE NULLS NOT DISTINCT (folder_key, owner_email)`** (chosen) | NULL = NULL for uniqueness — prevents duplicate legacy rows; standard SQL:2023 syntax; supported in PostgreSQL 15+ | Requires PostgreSQL 15+; less familiar to developers who expect NULL ≠ NULL |
| **`UNIQUE (folder_key, owner_email)` (default NULLS DISTINCT)** | Standard behavior, no surprises | Allows duplicate `(key, NULL)` rows — silently breaks uniqueness for legacy data |
| **Partial unique index (`WHERE owner_email IS NULL`) + composite unique** | Works on older PostgreSQL versions | Two indexes to maintain; more complex migration; partial index is easy to forget during schema review |
| **Backfill-then-migrate (make column NOT NULL first)** | No NULL-handling question at all | Requires a backfill step before the migration can apply — not zero-downtime; blocks the fix on an operational step |

## Implementation notes

- **Migration:** `drizzle/0008_drive_folders_owner_email.sql` — three statements: `ADD COLUMN`, `DROP CONSTRAINT uq_drive_folders_key`, `ADD CONSTRAINT uq_drive_folders_key_owner UNIQUE NULLS NOT DISTINCT (folder_key, owner_email)`
- **Schema:** `src/db/schema/drive-folders.ts` — `ownerEmail: text("owner_email")` with `.nullsNotDistinct()` on the unique constraint
- **Backfill (recommended post-deploy):** `UPDATE drive_folders SET owner_email = '<teacher-email>' WHERE owner_email IS NULL;`
- **Follow-up — identity convergence:** When a `users` table is introduced, all ownership columns (`courses.owner_email`, `copilot_conversations.owner_email`, `drive_folders.owner_email`, `units.user_id`) must converge to `owner_id uuid REFERENCES users(id)`.
- **PostgreSQL version requirement:** `NULLS NOT DISTINCT` requires PostgreSQL 15+. Neon (the hosting provider) defaults to PostgreSQL 16, so this is satisfied.

## Links

- [PostgreSQL 15: NULLS NOT DISTINCT](https://www.postgresql.org/docs/15/sql-createtable.html#SQL-CREATETABLE-EXCLUDE) — documents the `NULLS NOT DISTINCT` unique constraint modifier.
- [Issue #144](https://github.com/jaetill/ai-teacher/issues/144) — the issue this change closes.
- [ADR-0021](0021-course-ownership-column.md) — prior art: `owner_email` on `courses`.
- [ADR-0022](0022-copilot-conversation-ownership-column.md) — prior art: `owner_email` on `copilot_conversations`.
- [ADR-0023](0023-unit-ownership-user-id-column.md) — prior art: `user_id` on `units` (divergent identity claim).
