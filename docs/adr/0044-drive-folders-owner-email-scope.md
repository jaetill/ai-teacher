# ADR-0044: Drive-folder ownership — `owner_email` column and scoped unique constraint on `drive_folders`

- **Status:** Proposed
- **Date:** 2026-06-28
- **Deciders:** Jason
- **Tags:** schema, security, authorization

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

All six API routes that query `drive_folders` (`drive/import`, `drive/setup`, `units/[id]`, `units/[id]/link-materials`, `upload/check-duplicates`, `upload/file`) looked up rows by `folder_key` alone, with no ownership predicate. Any authenticated user could read or write to another user's Drive folder mappings — a classic IDOR (issue #479).

ADR-0021 and ADR-0022 established a nullable `owner_email text` column pattern for `courses` and `copilot_conversations`. This PR extends that pattern to `drive_folders`, but additionally changes the table's unique constraint from `(folder_key)` to `(folder_key, owner_email)` with `NULLS NOT DISTINCT`. The constraint change is necessary because `drive_folders` uses `folder_key` as its natural key for upsert logic — without scoping the uniqueness to the owner, two teachers sharing a grade/quarter naming convention would collide.

How should drive-folder ownership be represented, and how should the unique constraint change to support per-user folder mappings?

## Decision Drivers

- **Security.** The IDOR across all six Drive-related endpoints must be closed.
- **Consistency with prior ownership ADRs.** ADR-0021 (`courses`) and ADR-0022 (`copilot_conversations`) use `owner_email`. ADR-0023 (`units`) diverged to `user_id` (OAuth `sub`). Choosing `owner_email` here keeps 3-of-4 tables consistent and defers the identity-claim convergence to the future `users` table.
- **Uniqueness semantics.** `folder_key` was the sole unique key. With multi-user, two teachers can have identical folder keys (e.g., `grade_8_Q1_Curriculum`). The unique constraint must include the owner.
- **Legacy-row compatibility.** Pre-auth rows have `owner_email = NULL`. The null-handling policy and constraint must allow these rows to coexist without violating uniqueness or breaking existing queries.
- **Migration safety.** The constraint change (`DROP` old, `ADD` new) must not fail on existing data and must be non-blocking in production.

## Considered Options

- Sub-decision 1: Identity claim for the ownership column
- Sub-decision 2: Null-handling policy for legacy rows
- Sub-decision 3: Unique-constraint strategy

## Decision Outcome

We chose the bundle:

- Sub-decision 1 → **`owner_email` text column** (consistent with ADR-0021/0022)
- Sub-decision 2 → **Open-null policy** — queries use `or(eq(ownerEmail, email), isNull(ownerEmail))` so legacy rows remain accessible to any authenticated user
- Sub-decision 3 → **Composite unique constraint `(folder_key, owner_email)` with `NULLS NOT DISTINCT`** — prevents duplicate legacy rows while allowing per-user folder keys

The bundle is internally consistent because the `NULLS NOT DISTINCT` modifier directly addresses the null-handling policy: it treats `(key, NULL)` pairs as equal, preventing multiple legacy rows with the same folder key while still allowing one NULL row and one owned row to coexist.

## Consequences

### Positive

- **IDOR closed across all six endpoints.** Every `drive_folders` query now includes the `ownerEmail` predicate, preventing cross-user data access.
- **Consistent with ADR-0021/0022.** Same `owner_email` column, same identity claim, same open-null approach — reduces cognitive load for future contributors.
- **Multi-user safe uniqueness.** Two teachers with grade 8, Q1 folders get independent rows. The old `(folder_key)` constraint would have forced a conflict.
- **Legacy rows preserved.** The `NULLS NOT DISTINCT` modifier means at most one `NULL`-owner row per folder key. Existing data is not duplicated or orphaned.

### Negative

- **Denormalized identity.** Same email-duplication concern as ADR-0021 — if a teacher's Google email changes, rows must be updated. Mitigated: Google Workspace emails are stable; consumer Gmail changes are rare.
- **Constraint change is a DDL migration.** `DROP CONSTRAINT` + `ADD CONSTRAINT` requires a brief lock on `drive_folders`. Acceptable for the current table size but should be run during low-traffic windows at scale.
- **Two identity systems persist.** `drive_folders`, `courses`, and `copilot_conversations` use `owner_email`; `units` uses `user_id` (ADR-0023). Convergence is deferred to the future `users` table.

### Neutral

- **Column is nullable by design.** Intentional for backward compatibility, same as ADR-0021/0022/0023. Will become `NOT NULL` (or be replaced by an FK) when a `users` table lands and all rows are backfilled.
- **`NULLS NOT DISTINCT` is a PostgreSQL 15+ feature.** Neon (the target database) runs PostgreSQL 16, so this is not a compatibility concern.
- **Open-null is less secure than fail-closed.** Any authenticated user can access legacy drive-folder rows. Acceptable for the single-teacher deployment; the migration window should be closed by backfilling `owner_email` post-deploy.

## Pros and Cons of the Options

### Sub-decision 1: Identity claim

| Option | Pros | Cons |
|---|---|---|
| **`owner_email`** (chosen) | Consistent with ADR-0021/0022 (3-of-4 tables); uses the claim already on the NextAuth session; no additional wiring | Inherits email-change fragility; diverges from ADR-0023's `user_id` |
| **`user_id` (OAuth `sub`)** | Immutable, stable across email changes (ADR-0023 rationale); closer to eventual FK | Inconsistent with `courses` and `copilot_conversations`; requires `token.sub` wiring on all six routes |

### Sub-decision 2: Null-handling policy

| Option | Pros | Cons |
|---|---|---|
| **Open-null** (chosen) | Legacy rows remain accessible without backfill; zero operational steps post-deploy | Any authenticated user can access NULL-owner rows during migration window |
| **Fail-closed** | More secure during migration window | Locks out all pre-auth folder mappings until backfilled; breaks Drive setup/import for the existing teacher |

### Sub-decision 3: Unique-constraint strategy

| Option | Pros | Cons |
|---|---|---|
| **`(folder_key, owner_email) NULLS NOT DISTINCT`** (chosen) | Prevents duplicate legacy rows (`NULL, NULL` treated as equal); allows per-user keys; single migration step | Requires PostgreSQL 15+ (met by Neon); DDL lock during constraint swap |
| **`(folder_key, owner_email)` default (NULLS DISTINCT)** | Standard SQL behavior; same DDL | Allows unlimited `(key, NULL)` rows — legacy rows can pile up, breaking the upsert logic |
| **Keep `(folder_key)` unique, no constraint change** | No DDL risk | Two teachers with the same folder key would conflict; multi-user is broken at the schema level |

## Implementation notes

- **Migration:** `drizzle/0008_drive_folders_owner_email.sql` — three statements: `ADD COLUMN owner_email text`, `DROP CONSTRAINT uq_drive_folders_key`, `ADD CONSTRAINT uq_drive_folders_key_owner UNIQUE NULLS NOT DISTINCT (folder_key, owner_email)`.
- **Schema:** `src/db/schema/drive-folders.ts` — `ownerEmail: text("owner_email")` + updated unique constraint definition.
- **Routes hardened (6 total):**
  - `src/app/api/drive/import/route.ts` — session email extraction + scoped `where` clause
  - `src/app/api/drive/setup/route.ts` — scoped lookups + `ownerEmail` set on insert/update
  - `src/app/api/units/[id]/route.ts` — `ownerPredicate` applied to curriculum and quarter folder lookups
  - `src/app/api/units/[id]/link-materials/route.ts` — scoped `inArray` query
  - `src/app/api/upload/check-duplicates/route.ts` — scoped `inArray` query
  - `src/app/api/upload/file/route.ts` — scoped `eq` query
- **Tests:** `tests/api/upload/file.test.ts` — 5 tests: 401 (unauthenticated), 401 (no email claim), 404 (no matching folder), IDOR regression (caller's email in predicate), cross-user isolation.
- **Backfill (recommended post-deploy):** `UPDATE drive_folders SET owner_email = '<teacher-email>' WHERE owner_email IS NULL;`
- **Follow-up — identity convergence:** When a `users` table is introduced, all four ownership columns (`courses.owner_email`, `copilot_conversations.owner_email`, `drive_folders.owner_email`, `units.user_id`) must converge to `owner_id uuid REFERENCES users(id)`.

## Links

- [OWASP IDOR](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/05-Authorization_Testing/04-Testing_for_Insecure_Direct_Object_References) — the vulnerability class this addresses.
- [Issue #479](https://github.com/jaetill/ai-teacher/issues/479) — the Drive-folder IDOR report.
- [ADR-0021](0021-course-ownership-column.md) — prior art: `owner_email` on `courses`.
- [ADR-0022](0022-copilot-conversation-ownership-column.md) — prior art: `owner_email` on `copilot_conversations`, fail-closed null policy.
- [ADR-0023](0023-unit-ownership-user-id-column.md) — prior art: `user_id` on `units`, open-null policy.
- [PostgreSQL 15: `NULLS NOT DISTINCT`](https://www.postgresql.org/docs/15/sql-createtable.html#SQL-CREATETABLE-EXCLUDE) — the feature enabling the unique constraint to treat NULL owner pairs as duplicates.
