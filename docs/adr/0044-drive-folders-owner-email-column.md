# ADR-0044: Drive-folders ownership — `owner_email` column on `drive_folders` table

- **Status:** Proposed
- **Date:** 2026-06-27
- **Deciders:** Jason
- **Tags:** schema, security, authorization

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

The `drive_folders` table maps logical folder keys (e.g. `"grade_6_Q1_Lessons"`) to Google Drive folder IDs. Queries in `GET /api/units/[id]` and `POST /api/units/[id]/link-materials` looked up Drive folders by `folder_key` alone, with no ownership predicate. Any authenticated user could resolve another teacher's Drive folders by supplying the correct folder key — an IDOR vulnerability on the same axis as the course/unit/conversation ownership issues fixed in ADR-0021, ADR-0022, and ADR-0023.

How should we represent folder ownership in the `drive_folders` table so that Drive-folder lookups are scoped to the requesting teacher?

## Decision Drivers

- **Security.** The IDOR is an active vulnerability; the fix must ship without waiting for a full users-table migration, consistent with the approach taken for courses (ADR-0021), conversations (ADR-0022), and units (ADR-0023).
- **Unique constraint correctness.** The existing unique constraint `uq_drive_folders_key(folder_key)` prevents two teachers from having the same logical folder key (e.g. both having a `"root"` folder). Multi-user support requires the constraint to be scoped per owner.
- **Single-teacher deployment.** ai-teacher currently serves one teacher. The ownership model needs to be correct for multi-user but does not need to be optimized for scale yet.
- **Consistency with prior ownership ADRs.** ADR-0021, ADR-0022, and ADR-0023 all use the same pattern: nullable `owner_email text` column scoped to the NextAuth session email.
- **Backward compatibility.** Existing rows have no ownership data. The migration must not break the running app before a backfill is applied.

## Considered Options

- **Option A:** Add a nullable `owner_email text` column to `drive_folders`, widen the unique constraint to `(folder_key, owner_email)`, filter queries by session email
- **Option B:** Create a `users` table now, add `owner_id uuid` FK to `drive_folders`
- **Option C:** No schema change — filter by joining through the `courses` table (which already has `owner_email`)

## Decision Outcome

Chosen option: **Option A — nullable `owner_email` text column with widened unique constraint**, because it closes the IDOR immediately using the same proven pattern as the three prior ownership ADRs, and the unique constraint change is necessary to support multiple teachers with overlapping folder keys.

## Consequences

### Positive

- **IDOR closed.** API routes scope `drive_folders` queries with `eq(driveFolders.ownerEmail, sessionEmail)`, preventing cross-user Drive folder access.
- **Multi-user unique constraint.** The widened constraint `(folder_key, owner_email)` correctly allows two teachers to each have a `"root"` folder while preventing duplicates within a single teacher's folder set.
- **Zero-downtime migration.** `ALTER TABLE ADD COLUMN` with no `NOT NULL` constraint is non-blocking. The constraint drop-and-recreate is fast on a small table.
- **Pattern consistency.** Same ownership pattern as courses, conversations, and units — one approach to audit and eventually migrate to a `users` FK.

### Negative

- **Denormalized identity.** Email is duplicated across `drive_folders` rows, adding a fourth table with the same denormalization as courses, conversations, and units. When a `users` table lands, four tables will need FK migration.
- **Backfill required.** Existing `drive_folders` rows need `owner_email` populated. For the single-teacher deployment this is a one-time `UPDATE`, but it is an operational step.
- **Nullable composite unique constraint.** PostgreSQL treats `NULL` as distinct in unique constraints, so rows with `owner_email IS NULL` do not conflict with each other. This is the desired behavior during the backfill window but could mask duplicates if the backfill is delayed.

### Neutral

- **Column is nullable.** Intentional for backward compatibility, consistent with all prior ownership columns. Will be made `NOT NULL` when a `users` table is introduced and all rows are backfilled.
- **No new index on `owner_email` alone.** The composite unique constraint covers queries that filter by `(folder_key, owner_email)`. A standalone index is not needed for the current single-teacher workload.

## Pros and Cons of the Options

### Option A: Nullable `owner_email` text column with widened unique constraint

- ✅ Pro: Ships immediately — one migration, two route changes, closes the IDOR today.
- ✅ Pro: Uses the same identity claim (`email`) already in the NextAuth session, no join needed.
- ✅ Pro: Consistent with ADR-0021/0022/0023 — one pattern to audit and migrate.
- ✅ Pro: Widened unique constraint correctly models per-teacher folder ownership.
- ❌ Con: Fourth table with denormalized email — increases the FK migration surface when a `users` table arrives.
- ❌ Con: Fragile if email changes (mitigated: Google Workspace emails are stable).

### Option B: Create `users` table now, add `owner_id` FK

- ✅ Pro: Normalized from day one — single source of truth for user identity.
- ✅ Pro: FK constraint enforces referential integrity.
- ❌ Con: Requires designing the `users` table schema before the auth story is settled (CLAUDE.md: "Auth: TBD").
- ❌ Con: Would need to retrofit courses, conversations, and units simultaneously for consistency — much larger scope.
- ❌ Con: Premature commitment to a schema that may change when the auth decision is made.

### Option C: No schema change — join through `courses.owner_email`

- ✅ Pro: No migration, no new column.
- ❌ Con: `drive_folders` has no direct FK to `courses` — the join path is indirect and fragile (`folder_key` encodes grade and quarter, requiring string parsing or a lookup table).
- ❌ Con: The unique constraint `uq_drive_folders_key(folder_key)` still prevents multi-user folder keys — would need to be dropped regardless.
- ❌ Con: Every route must reconstruct the ownership join, increasing the chance of an IDOR regression.

## Implementation notes

- **Migration:** `drizzle/0008_add_owner_email_to_drive_folders.sql` — `ALTER TABLE "drive_folders" ADD COLUMN "owner_email" text;` + drop and recreate `uq_drive_folders_key` as `UNIQUE("folder_key", "owner_email")`
- **Schema:** `src/db/schema/drive-folders.ts` — `ownerEmail: text("owner_email")`, unique constraint widened to `(table.folderKey, table.ownerEmail)`
- **API routes hardened:**
  - `src/app/api/units/[id]/route.ts` — `and(eq(driveFolders.folderKey, key), eq(driveFolders.ownerEmail, email))`
  - `src/app/api/units/[id]/link-materials/route.ts` — session email guard + `and(inArray(driveFolders.folderKey, folderKeys), eq(driveFolders.ownerEmail, ownerEmail))`
- **Test coverage:** `tests/api/units-id.test.ts` and `tests/api/units/link-materials.test.ts` — IDOR guard assertions verifying `ownerEmail` predicate is present in queries
- **Backfill (manual, post-deploy):** `UPDATE drive_folders SET owner_email = '<teacher-email>' WHERE owner_email IS NULL;`
- **Follow-up:** When a `users` table is introduced, migrate `owner_email` to `owner_id uuid REFERENCES users(id)` across all four ownership tables (courses, copilot_conversations, units, drive_folders).

## Links

- [OWASP IDOR](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/05-Authorization_Testing/04-Testing_for_Insecure_Direct_Object_References) — the vulnerability class this addresses.
- [ADR-0021](0021-course-ownership-column.md) — course ownership column (same pattern).
- [ADR-0022](0022-copilot-conversation-ownership-column.md) — conversation ownership column (same pattern).
- [ADR-0023](0023-unit-ownership-user-id-column.md) — unit ownership column (same pattern).
- [ADR-0001](0001-platform-adoption.md) — platform adoption; notes auth is TBD.
