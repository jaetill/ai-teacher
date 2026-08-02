# ADR-0048: Lesson templates — new table and FK columns on `courses` / `lessons`

- **Status:** Proposed
- **Date:** 2026-08-02
- **Deciders:** Jason (product owner), Claude (architect review)
- **Tags:** schema

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

The shape of a lesson — which sections it has and in what order — is currently hardcoded: `lessons.lesson_plan` always holds `{activities: [...]}`, and the generation prompt bakes that key in. The teacher has no way to say "my reading days have a bell-ringer, guided reading, and exit ticket, but my seminar days have a focus question, discussion, and reflection." Forcing every lesson through one shape makes the planned consistency report unreliable and limits AI generation to a structure the teacher may not use.

How should the system represent teacher-defined lesson structures so that generation, validation, and the consistency report all operate on the teacher's own shape rather than ours?

## Decision Drivers

- **Teacher ownership.** The teacher should define the fields her lessons contain, not the codebase.
- **Multiple shapes per teacher.** A single teacher uses different lesson formats (reading day vs. seminar day); a one-template-per-course model is insufficient.
- **Zero-migration back-compat.** Existing lessons have `{activities: [...]}` and must remain valid without a data backfill.
- **Neon-http constraints.** No interactive transactions; migrations must be additive DDL only.
- **Downstream consumers.** Both AI generation (needs a JSON schema to fill) and the consistency report (needs a list of required fields to check) must derive their behavior from the same template definition.

## Considered Options

- **Option A:** New `lesson_templates` table with nullable FK columns on `courses` and `lessons` (chosen)
- **Option B:** Store the template definition inline as a JSONB column on `courses`
- **Option C:** Hardcode a fixed set of template "presets" in application code

## Decision Outcome

Chosen option: **Option A**, because named, reusable templates let a teacher define multiple lesson shapes independently of any single course, and the nullable FK cascade (`lesson.template_id → course.lesson_template_id → Classic builtin`) provides zero-backfill back-compat.

### Resolution order

For any given lesson the effective template is resolved as:

1. `lessons.template_id` — if the lesson explicitly names a template (e.g. a seminar day inside a reading unit)
2. `courses.lesson_template_id` — the course-level default
3. The Classic builtin — a single `activities` list field, exactly matching every pre-template lesson

Both FK columns are nullable; a lesson with no template at any level resolves to Classic, whose shape is `{activities: [...]}` — the shape every existing row already has.

## Consequences

### Positive

- The teacher can define and name her own lesson structures; the AI generates into her fields, and the consistency report checks against them.
- No data migration needed — every existing lesson is valid against the Classic builtin without any row updates.
- Templates are reusable across courses and independently deletable (delete detaches, does not cascade into content).
- The "derive from my lessons" flow (AI reads her existing plans and proposes a template) eliminates the blank-page problem.

### Negative

- `lesson_plan` is now a loosely-typed JSONB bag keyed by the template's field keys. A template rename or field-key change can orphan content in existing lessons. Mitigation: keys are stable slugs (`KEY_RE = /^[a-z][a-z0-9_]*$/`), and label changes do not affect the key.
- No database-level FK constraint between `lessons.template_id` / `courses.lesson_template_id` and `lesson_templates.id`. Enforced in application code. This avoids cascading deletes that would destroy lesson content, but it means the DB alone cannot prevent a dangling reference.

### Neutral

- The `fields` column on `lesson_templates` stores a `TemplateField[]` as JSONB. The application-layer type (`src/lib/lesson-template.ts`) is the source of truth for the shape; Postgres treats it as opaque.
- Builtins (`owner_email IS NULL`) are visible to all users but not editable. Ownership scoping follows the same pattern as ADR-0044 / ADR-0045.

## Pros and Cons of the Options

### Option A: New `lesson_templates` table with FK columns

- ✅ Pro: Multiple named templates per teacher, reusable across courses
- ✅ Pro: Nullable FKs + resolution cascade = zero-backfill for existing data
- ✅ Pro: Template is a first-class entity — can be derived by AI, edited, shared
- ❌ Con: Loose coupling between JSONB content and template shape; no DB-level enforcement
- ❌ Con: Three-step resolution adds a query join or application lookup per lesson render

### Option B: Inline JSONB template definition on `courses`

- ✅ Pro: No new table; template lives next to the course
- ❌ Con: One shape per course — cannot model a seminar day inside a reading unit
- ❌ Con: Duplicated if two courses use the same structure
- ❌ Con: No independent lifecycle — cannot list, share, or derive templates across courses

### Option C: Hardcoded preset templates in application code

- ✅ Pro: No schema change at all
- ❌ Con: Teacher cannot define her own shapes — defeats the purpose
- ❌ Con: Every new template shape requires a code deploy

## Implementation notes

- **Migration:** `drizzle/0013_lesson_templates.sql`
  - `CREATE TABLE lesson_templates` (id, owner_email, name, description, fields JSONB, is_default, source, created_at, updated_at)
  - `ALTER TABLE courses ADD COLUMN lesson_template_id uuid`
  - `ALTER TABLE lessons ADD COLUMN template_id uuid`
  - `CREATE INDEX idx_lesson_templates_owner ON lesson_templates (owner_email)`
- **Schema:** `src/db/schema/lesson-templates.ts`, with re-export from `src/db/schema/index.ts`
- **Pure logic:** `src/lib/lesson-template.ts` — `normalizeFields()`, `templateToPromptSchema()`, `checkLesson()`, `CLASSIC_FIELDS`, `STARTER_FIELDS`
- **API routes:**
  - `POST /api/lesson-templates` — CRUD (create, list, update, delete)
  - `POST /api/lesson-templates/derive` — AI-powered template proposal from existing lessons
  - `POST /api/lesson-templates/report` — consistency report across a course's lessons
- **UI:** `src/app/templates/page.tsx` — template editor, derive flow, report viewer
- **Tests:** 46 new tests across `tests/api/lesson-templates.test.ts` and `tests/lib/lesson-template.test.ts`

## Links

- PR #677 — implementation
- ADR-0044 — `drive_folders` owner-email scoping (same nullable-ownership pattern)
- ADR-0045 — `courses` unique constraint scoped to owner (same ownership model)
