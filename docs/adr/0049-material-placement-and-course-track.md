# ADR-0049: Material placement columns and course track — destructive constraint/column migrations

- **Status:** Proposed
- **Date:** 2026-08-24
- **Deciders:** Jason (product owner), Claude (architect review)
- **Tags:** destructive-migration, schema, import, curriculum

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

The import flow previously fused "what am I importing" and "where does it go" into a single Drive folder path (`grade_7_Q2_Lessons`). That path was simultaneously the storage location, the curriculum placement, and the reason a build had to run one quarter at a time. Two problems:

1. **Course identity is too narrow.** The unique constraint on `courses` is `(grade, subject, school_year_id, owner_email)`. A teacher who runs both Honors and Regular curricula for the same grade cannot have two course rows — they differ only in track, which has no column.

2. **Material placement is implicit.** A material's grade, quarter, and category exist only inside `drive_folders.folder_key`. There is no way to query "all materials for this course in Q2" without parsing folder-key strings, and no way to place a material that was not imported from a Drive folder.

How should the schema change so that (a) a course can carry a curriculum track, and (b) a material knows where it sits in the curriculum as structured data rather than a path convention?

## Decision Drivers

- **Her folders are her units** (CLAUDE.md, inviolable). Placement columns must not interfere with the folder → unit mapping. They describe a different axis: which course and which quarter, not which unit.
- **Honors vs. Regular is a curriculum distinction, not a section.** Two tracks have different pacing guides, different anchor texts, different assessments. The unique key must allow both to coexist.
- **Neon-http driver prohibits interactive transactions.** Migrations must be DDL-only or use `db.batch()`. No multi-step data-backfill-inside-transaction patterns.
- **Backward compatibility.** All new columns must be nullable so existing rows (649 materials, multiple courses) are unaffected without a data backfill.
- **The import redesign ships as one PR.** The three migrations (0014–0016) are applied together; the intermediate `term` column never reaches production in isolation.

## Considered Options

- Sub-decision 1: How to represent curriculum track on `courses`
- Sub-decision 2: How to record material placement in the curriculum

## Decision Outcome

We chose the bundle:

- Sub-decision 1 → **Option A: Add a nullable `track` column and widen the unique constraint**
- Sub-decision 2 → **Option A: Add `course_id`, `quarter`, and `category` columns directly on `materials`**

The bundle is internally consistent because materials need a `course_id` FK to point to a course, and that FK is meaningful only if the course table can distinguish tracks — otherwise a material placed in "Grade 8 Honors Q2" would resolve to the wrong (or nonexistent) course row.

## Consequences

### Positive

- A teacher can now hold Honors and Regular as separate courses for the same grade/subject/year — the widened unique constraint permits it.
- Material queries ("everything for this course, optionally this quarter") are a simple `WHERE course_id = ? AND quarter = ?` — no folder-key parsing.
- The `ON DELETE CASCADE` on `materials.course_id` means deleting a course cleans up its material placements automatically.
- All new columns are nullable; existing data is untouched.

### Negative

- **Destructive DDL.** Migration 0014 drops the existing unique constraint `uq_courses_grade_subject_year_owner` and replaces it. Rollback requires verifying no two courses now share the same `(grade, subject, school_year_id, owner_email)` tuple with different `track` values — otherwise re-adding the old narrower constraint would fail.
- **Column churn in the migration sequence.** `materials.term` is added in 0014 and dropped in 0015, replaced by `quarter` in 0016. The net effect is clean (only `quarter` survives), but the journal records the intermediate step. This is acceptable because all three migrations ship together and were applied atomically to the production database.
- **Placement is denormalized.** `quarter` on materials duplicates information derivable from `units.quarter` (one join away via `course_id`). This is intentional: a material can be placed in a quarter before any unit exists (the import runs before the curriculum build), and a material can belong to no unit at all.

### Neutral

- The `idx_materials_placement` index is rebuilt twice across the migration sequence (term-based → course-only → course+quarter). Only the final form `(course_id, quarter)` persists. The intermediate index states existed only during development.
- `NULLS NOT DISTINCT` carries over from ADR-0045 to the new wider constraint, preserving the behavior that an untracked course (`track IS NULL`) still collides with itself.

## Pros and Cons of the Options

### Sub-decision 1: How to represent curriculum track

#### Option A: Nullable `track` column, widen unique constraint (chosen)

- ✅ Pro: Minimal schema change — one column, one constraint swap.
- ✅ Pro: `NULL` track means "untracked," the common case — no sentinel value needed.
- ✅ Pro: `NULLS NOT DISTINCT` on the constraint means untracked courses still collide with themselves, preserving ADR-0045 behavior.
- ❌ Con: Drops and replaces the existing unique constraint — a destructive DDL operation.

#### Option B: Separate `course_tracks` join table

- ✅ Pro: Avoids modifying the courses unique constraint.
- ❌ Con: Over-engineered — track is a simple attribute of the course, not an entity with its own lifecycle.
- ❌ Con: Every course query that needs track awareness requires a join.

#### Option C: Encode track in the `subject` column (e.g. "ELA Honors")

- ✅ Pro: No schema change at all.
- ❌ Con: Conflates two dimensions — subject and track — making them impossible to query independently.
- ❌ Con: Breaks existing filters and reports that match on `subject = 'ELA'`.

### Sub-decision 2: How to record material placement

#### Option A: Add `course_id`, `quarter`, `category` columns on `materials` (chosen)

- ✅ Pro: Direct, queryable columns — no parsing, no joins for the common query.
- ✅ Pro: `course_id` FK with cascade keeps referential integrity.
- ✅ Pro: All nullable — existing materials are valid without backfill.
- ✅ Pro: `category` captures the teacher's own folder-name classification (Lessons, Assessments, etc.) as data rather than requiring an AI classification pass.
- ❌ Con: `quarter` is somewhat denormalized relative to `units.quarter`.
- ❌ Con: Adds three columns to an already wide table.

#### Option B: Separate `material_placements` table

- ✅ Pro: Normalizes placement into its own entity — clean if a material can have multiple placements.
- ❌ Con: A material has exactly one placement (or none); a separate table adds a join for a 1:0..1 relationship.
- ❌ Con: More migration complexity for no practical benefit.

#### Option C: Store placement as a JSONB column on `materials`

- ✅ Pro: Single column, flexible shape.
- ❌ Con: Cannot index for the "all materials in course X, quarter Q2" query.
- ❌ Con: No FK constraint on `course_id` — referential integrity is application-only.

## Implementation notes

- **Migration 0014** (`drizzle/0014_third_captain_america.sql`):
  - `DROP CONSTRAINT uq_courses_grade_subject_year_owner` — removes the ADR-0045 constraint
  - `ADD COLUMN courses.track` (nullable text)
  - `ADD COLUMN materials.course_id` (uuid FK → courses.id, ON DELETE CASCADE)
  - `ADD COLUMN materials.term` (text) — intermediate, dropped in 0015
  - `ADD COLUMN materials.category` (text)
  - `ADD CONSTRAINT uq_courses_grade_subject_track_year_owner` — replacement constraint including `track`
  - `CREATE INDEX idx_materials_placement` on `(course_id, term)`
- **Migration 0015** (`drizzle/0015_drop_material_term.sql`):
  - `DROP COLUMN materials.term` — replaced by `quarter` in 0016
  - Rebuilds `idx_materials_placement` on `(course_id)` only
- **Migration 0016** (`drizzle/0016_add_material_quarter.sql`):
  - `ADD COLUMN materials.quarter` (text)
  - Rebuilds `idx_materials_placement` on `(course_id, quarter)` — final form
- **Schema source:** `src/db/schema/courses.ts` (track column, widened unique), `src/db/schema/materials.ts` (courseId, quarter, category columns, placement index)
- **Verified against production:** all three migrations applied to Neon DB; `information_schema` confirms columns present, 649 materials intact, constraint active.
- **Backup tooling:** `scripts/db-backup.mjs` / `db-restore.mjs` / `db-reset.mjs` added in the same PR to support safe rollback of destructive migrations.

## Links

- PR #688 — implementation
- [ADR-0045](0045-scope-courses-unique-constraint-to-owner.md) — the prior unique constraint this ADR's migration drops and replaces
- [ADR-0047](0047-materials-source-unit-column.md) — prior additive column on `materials` (same table, same pattern)
