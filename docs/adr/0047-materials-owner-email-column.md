# ADR-0047: Materials ownership — `owner_email` column on `materials` table

- **Status:** Proposed
- **Date:** 2026-06-29
- **Deciders:** Jason
- **Tags:** schema, security, authorization

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

`POST /api/upload/file` inserts a row into `materials` after uploading a file to Google Drive. Before this change, the inserted row carried no ownership data — any authenticated user's material was indistinguishable from any other's at the database level. While the `drive_folders` query in the same route was already scoped by `ownerEmail` (ADR-0044), the material record itself was unattributed, making downstream read queries unable to enforce per-user access control on materials (issue #554).

ADR-0021, ADR-0022, and ADR-0044 established a nullable `owner_email text` column pattern for `courses`, `copilot_conversations`, and `drive_folders`. How should material ownership be represented to close this gap?

## Decision Drivers

- **Security.** Materials must be attributable to their uploader so that read-path queries can be scoped per-user. Without an ownership column, any future multi-user query on `materials` is an IDOR waiting to happen.
- **Consistency with prior ownership ADRs.** Four tables already have ownership columns; three of four (`courses`, `copilot_conversations`, `drive_folders`) use `owner_email`. Maintaining the same pattern keeps the codebase uniform and reduces cognitive load.
- **Minimal scope.** This is a security fix, not an architecture overhaul. The change should be the smallest schema delta that closes the vulnerability.
- **Backward compatibility.** Existing material rows have no ownership data. The migration must not break the running app.
- **Schema evolution.** A future `users` table will unify all ownership columns into a single FK.

## Considered Options

- **Option A:** Add a nullable `owner_email text` column to `materials`, stamp it on insert
- **Option B:** Add a nullable `user_id text` column (OAuth `sub`) to `materials`, matching the ADR-0023 divergence
- **Option C:** Derive ownership from `drive_folders.owner_email` via the existing `drive_folder_id` column — no new column

## Decision Outcome

Chosen option: **Option A — nullable `owner_email` text column**, because it closes the attribution gap with a single-column migration, is consistent with 3-of-4 prior ownership ADRs, and uses the identity claim already available on the NextAuth session without additional wiring.

## Consequences

### Positive

- **Materials are attributable.** Every newly uploaded material is stamped with the uploader's email, enabling per-user access control on future read-path queries.
- **Consistent with ADR-0021/0022/0044.** Same column name, same identity claim, same nullable pattern — 4-of-5 ownership tables now use `owner_email`.
- **Zero-downtime migration.** `ALTER TABLE ADD COLUMN` with no `NOT NULL` constraint is non-blocking on PostgreSQL. Existing rows get `NULL`.

### Negative

- **Denormalized identity.** Same email-duplication concern as ADR-0021 — if a teacher's Google email changes, material rows must be updated. Mitigated: Google Workspace emails are stable.
- **Insert-only hardening.** This PR stamps `ownerEmail` on the insert path but does not add ownership predicates to the 12 routes that read from `materials`. Read-path hardening is follow-up work.
- **No index on `owner_email`.** Acceptable for the current single-teacher workload; multi-user scaling will need `CREATE INDEX idx_materials_owner_email ON materials(owner_email)`.

### Neutral

- **Column is nullable by design.** Intentional for backward compatibility, same as all prior ownership ADRs. Will become `NOT NULL` (or be replaced by an FK) when a `users` table lands and all rows are backfilled.
- **No unique constraint change.** Unlike `drive_folders` (ADR-0044), `materials` has no natural key that needs per-owner scoping — each material row is identified by a random UUID. The existing indexes are unaffected.
- **Two identity systems persist.** `materials`, `courses`, `copilot_conversations`, and `drive_folders` use `owner_email`; `units` uses `user_id` (ADR-0023). Convergence is deferred to the future `users` table.

## Pros and Cons of the Options

### Option A: Nullable `owner_email` text column

- ✅ Pro: Ships immediately — one migration, one code change per the established pattern.
- ✅ Pro: Uses the same identity claim (`email`) already on the NextAuth session; no join or additional wiring needed.
- ✅ Pro: Consistent with 3-of-4 prior ownership columns — reduces cognitive load for future contributors.
- ❌ Con: Denormalized — email duplicated across rows.
- ❌ Con: Fragile if email changes (mitigated: Google Workspace emails are stable).

### Option B: Nullable `user_id` text column (OAuth `sub`)

- ✅ Pro: Immutable identity claim — no email-change fragility.
- ❌ Con: Inconsistent with `courses`, `copilot_conversations`, and `drive_folders` — would make it 2-of-5 tables on `user_id` vs 3-of-5 on `owner_email`, deepening the two-identity-system problem.
- ❌ Con: Requires wiring `token.sub` into the upload route, which currently only uses `session.user.email`.

### Option C: Derive ownership from `drive_folders.owner_email` via FK

- ✅ Pro: No new column — ownership is transitive through `drive_folder_id`.
- ❌ Con: Not all materials are Drive-backed. Materials with `storageType = 'url'` or `'inline'` have no folder association — ownership would be undefined for those rows.
- ❌ Con: Every ownership check requires a join to `drive_folders`, coupling materials queries to the Drive schema.
- ❌ Con: If a material's folder is deleted or re-assigned, the ownership trail breaks.

## Implementation notes

- **Migration:** `drizzle/0011_materials_owner_email.sql` — `ALTER TABLE "materials" ADD COLUMN "owner_email" text;`
- **Schema:** `src/db/schema/materials.ts` — `ownerEmail: text("owner_email")`
- **Insert path hardened:** `src/app/api/upload/file/route.ts` — `ownerEmail` stamped from `session.user.email` in the `.values()` call.
- **Tests:** `tests/api/upload/file.test.ts` — IDOR regression test verifying `ownerEmail` is present in the insert values.
- **Backfill (recommended post-deploy):** `UPDATE materials SET owner_email = '<teacher-email>' WHERE owner_email IS NULL;`
- **Follow-up — read-path hardening:** 12 routes reference `materials` (`upload/check-duplicates`, `upload/classify`, `units/[id]`, `units/[id]/link-materials`, `drive/import`, `curriculum/editor/data`, `curriculum/editor/pool`, `curriculum/editor/update-material`, `import/build-curriculum`, `differentiation`, `copilot`). Each needs an `ownerEmail` predicate on its materials queries.
- **Follow-up — identity convergence:** When a `users` table is introduced, all five ownership columns must converge to `owner_id uuid REFERENCES users(id)`.

## Links

- [OWASP IDOR](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/05-Authorization_Testing/04-Testing_for_Insecure_Direct_Object_References) — the vulnerability class this addresses.
- [Issue #554](https://github.com/jaetill/ai-teacher/issues/554) — the materials ownership gap report.
- [ADR-0021](0021-course-ownership-column.md) — prior art: `owner_email` on `courses`.
- [ADR-0022](0022-copilot-conversation-ownership-column.md) — prior art: `owner_email` on `copilot_conversations`.
- [ADR-0023](0023-unit-ownership-user-id-column.md) — prior art: `user_id` on `units` (divergent identity claim).
- [ADR-0044](0044-drive-folders-owner-email-scope.md) — prior art: `owner_email` on `drive_folders` with scoped unique constraint.
