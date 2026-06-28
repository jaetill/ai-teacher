# ADR-0044: Drive-folder ownership — `owner_email` column on `drive_folders` table

- **Status:** Proposed
- **Date:** 2026-06-28
- **Deciders:** Jason
- **Tags:** schema, security, authorization

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

`GET /api/curriculum/editor/pool` queried `drive_folders` filtered only by `folderKey` (via `inArray`). The `folderKey` is derived from grade and quarter (e.g. `grade_8_Q1_Curriculum`), so two teachers with the same grade and quarter share the same key. Without an ownership predicate, the query could return Google Drive folder IDs belonging to a different teacher — an IDOR vulnerability (issue #481).

ADR-0021 and ADR-0022 established a nullable `owner_email text` column pattern for `courses` and `copilot_conversations`. ADR-0023 diverged to `user_id` (OAuth `sub`) on `units`. How should `drive_folders` represent ownership, and which identity-claim pattern should it follow?

## Decision Drivers

- **Security.** The IDOR on the pool endpoint must be closed immediately; Drive folder IDs are external resource handles that grant file-level access.
- **Consistency with prior art.** `courses` and `copilot_conversations` already use `owner_email`. `units` uses `user_id`. Choosing one pattern or the other affects the eventual convergence cost.
- **Query locality.** The pool route already has `userEmail` from the NextAuth session. Using `owner_email` avoids an extra lookup or join.
- **Migration safety.** Pre-ownership rows have no `owner_email`. The null-handling approach determines whether the fix is immediately effective or requires a backfill first.
- **Schema evolution.** All ownership columns will converge to a single `owner_id uuid` FK when a `users` table is introduced.

## Considered Options

- **Option A:** Add nullable `owner_email text` column (matching ADR-0021/0022 pattern), scope query with `and(inArray(...), eq(ownerEmail, userEmail))`
- **Option B:** Add nullable `user_id text` column (matching ADR-0023 pattern), scope query with `and(inArray(...), eq(userId, session.user.id))`
- **Option C:** Derive ownership from the parent `courses.owner_email` via a join through units → courses
- **Option D:** No schema change — filter Drive folder results in application code after the query

## Decision Outcome

Chosen option: **Option A — nullable `owner_email` text column**, because it closes the IDOR with the same proven pattern used on `courses` and `copilot_conversations`, requires no additional joins, and uses the identity claim already available in the pool route's session context.

The `owner_email` choice (over `user_id`/`sub`) is deliberate: `drive_folders` is conceptually closer to `courses` (both are owned resources queried by the curriculum editor routes that already use `userEmail` from the session). Consistency within this query path is more valuable than consistency with `units.user_id`, which serves a different route family.

## Consequences

### Positive

- **IDOR closed.** The pool query now returns only Drive folders belonging to the authenticated teacher, even when `folderKey` values collide across users.
- **Pattern consistency.** Same column name and identity claim as `courses` and `copilot_conversations` — no new identity system introduced.
- **Zero-downtime migration.** `ALTER TABLE ADD COLUMN` with no `NOT NULL` constraint is non-blocking on PostgreSQL.
- **No join required.** The pool route already resolves `userEmail` from the session; the predicate is a simple `eq` on the same table.

### Negative

- **Denormalized identity.** Email is duplicated across `drive_folders` rows, inheriting the same email-change fragility documented in ADR-0021.
- **Backfill required for full protection.** Pre-existing `drive_folders` rows have `owner_email = NULL`. The `and(inArray(...), eq(ownerEmail, userEmail))` predicate excludes these rows from results (fail-closed on null), so they become invisible until backfilled. For the single-teacher deployment this is a one-time `UPDATE`.
- **Identity-claim divergence with `units`.** `drive_folders` now uses `owner_email` while `units` uses `user_id` — the convergence obligation from ADR-0023 grows by one more column.

### Neutral

- **Column is nullable.** Intentional for backward compatibility, same as ADR-0021/0022. Will be made `NOT NULL` (or replaced with an FK) when the `users` table lands.
- **No index on `owner_email`.** Acceptable for the current single-teacher workload. Multi-user scaling needs `CREATE INDEX`.
- **Scope is pool endpoint only.** Other `drive_folders` queries (e.g. in `link-materials`, PR #469) will need the same ownership predicate in follow-up work.

## Pros and Cons of the Options

### Option A: Nullable `owner_email` text column (ADR-0021/0022 pattern)

- ✅ Pro: Ships immediately — one migration, one predicate addition.
- ✅ Pro: Consistent with `courses` and `copilot_conversations` — same column name, same identity claim.
- ✅ Pro: Uses the identity claim already in scope (`userEmail` from session) — no additional lookup.
- ❌ Con: Denormalized email, fragile if teacher changes Google account email.
- ❌ Con: Diverges from `units.user_id` (ADR-0023), adding to the convergence backlog.

### Option B: Nullable `user_id` text column (ADR-0023 pattern)

- ✅ Pro: Uses immutable OAuth `sub` — no email-change risk.
- ✅ Pro: Consistent with `units.user_id`.
- ❌ Con: Diverges from `courses` and `copilot_conversations`, which are the tables most closely related to `drive_folders` in query paths.
- ❌ Con: Requires `session.user.id` (the `sub` claim), which is wired in `auth.ts` but not used in the pool route today — adds a change surface.

### Option C: Derive ownership via join through units → courses

- ✅ Pro: No new column on `drive_folders` — ownership is transitive.
- ❌ Con: `drive_folders` are keyed by `folderKey` (grade + quarter), not by unit or course ID. The join path is indirect and fragile.
- ❌ Con: Every ownership check adds a multi-table join, coupling the pool route to the courses schema.
- ❌ Con: Orphaned or template drive folders would have no ownership path.

### Option D: No schema change — application-layer filtering

- ✅ Pro: No migration needed.
- ❌ Con: The query still returns other teachers' Drive folder IDs to the server — the IDOR is mitigated, not eliminated. A future bug in the filter logic re-exposes the data.
- ❌ Con: No database-level enforcement — every route must remember to filter, with no column to filter on.
- ❌ Con: Unauditable — ownership is implicit rather than explicit in the data model.

## Implementation notes

- **Migration:** `drizzle/0008_add_owner_email_to_drive_folders.sql` — `ALTER TABLE "drive_folders" ADD COLUMN "owner_email" text;`
- **Schema:** `src/db/schema/drive-folders.ts` — `ownerEmail: text("owner_email")`
- **API route hardened:** `src/app/api/curriculum/editor/pool/route.ts` — `and(inArray(driveFolders.folderKey, exactFolderKeys), eq(driveFolders.ownerEmail, userEmail))` predicate.
- **Tests:** `tests/api/curriculum/editor/pool.test.ts` — new test asserts `eq` is called with `driveFolders.ownerEmail` and the session email, catching silent removal of the predicate.
- **Backfill (manual, post-deploy):** `UPDATE drive_folders SET owner_email = '<teacher-email>' WHERE owner_email IS NULL;`
- **Follow-up — identity convergence:** When a `users` table is introduced, `drive_folders.owner_email` (along with `courses.owner_email` and `copilot_conversations.owner_email`) must be migrated to `owner_id uuid REFERENCES users(id)`.
- **Follow-up — other `drive_folders` routes:** PR #469 (`link-materials`, `units/[id]`) needs the same `ownerEmail` predicate.

## Links

- [OWASP IDOR](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/05-Authorization_Testing/04-Testing_for_Insecure_Direct_Object_References) — the vulnerability class this addresses.
- [Issue #481](https://github.com/jaetill/ai-teacher/issues/481) — the IDOR report for the pool endpoint.
- [PR #469](https://github.com/jaetill/ai-teacher/pull/469) — related `ownerEmail` scoping for `link-materials` and `units/[id]` (on hold, `requires-adr:schema`).
- [ADR-0021](0021-course-ownership-column.md) — prior art: `owner_email` on `courses`.
- [ADR-0022](0022-copilot-conversation-ownership-column.md) — prior art: `owner_email` on `copilot_conversations`, fail-closed null policy.
- [ADR-0023](0023-unit-ownership-user-id-column.md) — divergent prior art: `user_id` on `units`, open-null policy.
