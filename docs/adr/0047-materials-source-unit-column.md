# ADR-0047: Add `source_unit` column to materials table

- **Status:** Proposed
- **Date:** 2026-07-28
- **Deciders:** Jason (product owner), Claude (architect review)
- **Tags:** schema, import, curriculum

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

When a teacher imports materials from Google Drive, the import flow flattens all files into a single list regardless of how the teacher organized them in subfolders. Teachers typically group their Drive files by unit (e.g. "The Giver", "Poetry Unit"), and that organizational signal is lost on import.

How should we preserve the teacher's own unit grouping so that downstream features (build-curriculum, unit scaffolding) can create units from her structure rather than inventing them?

## Decision Drivers

- The teacher's Drive folder hierarchy is the most reliable signal for her intended unit groupings — it should not be discarded at import time.
- The column must be nullable: legacy imports pre-date this feature, and files at the root of a scanned folder have no unit.
- The migration must be safe to run on the existing production table (additive, no lock escalation).
- The neon-http driver prohibits interactive transactions; the migration is a single `ALTER TABLE … ADD COLUMN`.

## Considered Options

- Option A: Add a nullable `source_unit` text column directly on `materials`
- Option B: Store unit grouping in a separate `material_tags` or `material_metadata` table
- Option C: Derive unit grouping at query time from `drive_folder_id` lookups

## Decision Outcome

Chosen option: **Option A**, because the unit name is a simple, immutable attribute of the import event — it doesn't change after capture, doesn't need its own lifecycle, and a single nullable column avoids join overhead and schema complexity.

## Consequences

### Positive

- The teacher's folder structure is captured at import and available for curriculum scaffolding without re-querying Drive.
- Existing rows are unaffected (column is nullable, defaults to `NULL`).
- Migration is a single additive DDL statement — no data backfill, no table rewrite, no downtime risk.

### Negative

- The column stores a denormalized snapshot of the folder name at import time. If the teacher renames her Drive folder after import, the stored value is stale. This is acceptable because the value represents "what it was called when imported," not a live link.

### Neutral

- The UI gains a unit badge in the file list and a "Unit" column in the import review table — informational only, not editable.

## Pros and Cons of the Options

### Option A: Nullable `source_unit` text column on `materials`

- ✅ Pro: Simplest schema change — one column, one migration line
- ✅ Pro: No joins needed to read unit grouping
- ✅ Pro: Naturally nullable for legacy and root-level files
- ❌ Con: Denormalized; stale if the teacher renames the Drive folder post-import

### Option B: Separate `material_tags` / `material_metadata` table

- ✅ Pro: More extensible for future metadata beyond unit name
- ❌ Con: Adds a join on every materials query that needs unit info
- ❌ Con: Over-engineered for a single attribute with no independent lifecycle

### Option C: Derive unit grouping from `drive_folder_id` at query time

- ✅ Pro: Always reflects the current Drive folder name
- ❌ Con: Requires an API call to Google Drive on every read — latency and quota cost
- ❌ Con: Fails when the teacher's access token is expired or the folder is deleted

## Implementation notes

- Migration: `drizzle/0008_tiresome_talon.sql` — `ALTER TABLE "materials" ADD COLUMN "source_unit" text;`
- Schema: `src/db/schema/materials.ts` — `sourceUnit: text("source_unit")`
- GET handler: `src/app/api/drive/import/route.ts` — `listFolder()` now propagates the subfolder name as `sourceUnit`
- POST handler: same file — persists `sourceUnit` from the request body
- UI: `src/components/ImportFromDrive.tsx` — displays unit badges and a Unit column in the import table
- Tests: `tests/api/drive/import.test.ts` — two new tests covering GET capture and POST persistence

## Links

- PR #585 — implementation
- ADR-0044 — prior Drive scope decision (related import surface)
