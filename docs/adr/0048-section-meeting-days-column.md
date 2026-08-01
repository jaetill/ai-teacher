# ADR-0048: Add `meeting_days` column to sections table

- **Status:** Proposed
- **Date:** 2026-08-01
- **Deciders:** Jason (product owner), Claude (architect review)
- **Tags:** schema, calendar

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

Meeting days (the weekdays a class meets) are currently stored only at the course level. When a teacher has multiple sections of the same course that meet on different days (e.g. Period 3 meets MWF, Period 5 meets TTh), the calendar cannot represent this — every section inherits the same weekday grid and lessons land on the same dates for all sections.

How should we let individual sections override which weekdays they meet, so the calendar can place lessons on each section's actual class days?

## Decision Drivers

- Two sections of one course can meet on different weekdays — the data model must support per-section divergence without duplicating the entire course.
- Most sections still share the course's meeting days. The override must be optional so teachers aren't forced to configure every section.
- The neon-http driver prohibits interactive transactions; any migration must be a single DDL statement.
- The existing `courses.meetingDays` column stores a CSV of ISO weekday numbers ("1,2,3,4,5"). The section-level representation should match for consistency and reuse of parsing logic.

## Considered Options

- Option A: Add a nullable `meeting_days` text column on `sections` (NULL = inherit the course)
- Option B: Add a separate `section_schedules` table with one row per section-weekday
- Option C: Store the override in a JSONB `settings` column on `sections`

## Decision Outcome

Chosen option: **Option A**, because it mirrors the existing `courses.meetingDays` format, keeps the inheritance semantic simple (NULL = inherit), and avoids schema complexity or joins for what is a single, small attribute.

## Consequences

### Positive

- Each section can diverge from its course's meeting days, enabling accurate per-row lesson placement in the calendar.
- No changes needed for sections that share the course's days — NULL means "inherit," and existing rows default to NULL.
- Migration is a single `ALTER TABLE … ADD COLUMN` — no data backfill, no table rewrite, no downtime.
- The PATCH /api/sections endpoint validates and normalizes the CSV (dedup, sort, range-check 1–7) before persisting, and allows setting NULL to revert to course inheritance.

### Negative

- The CSV text format is denormalized; querying "all sections that meet on Wednesdays" requires string parsing. This is acceptable because the only consumer is the calendar UI, which already parses the course-level CSV.

### Neutral

- The Manage Sections panel gains per-section weekday toggles and a "reset to course days" action — UI complexity increases slightly but is scoped to the settings panel.

## Pros and Cons of the Options

### Option A: Nullable `meeting_days` text column on `sections`

- ✅ Pro: Matches the existing `courses.meetingDays` CSV format — zero new parsing code
- ✅ Pro: NULL-means-inherit keeps configuration burden low for the common case
- ✅ Pro: Single-column migration, safe on neon-http
- ❌ Con: CSV is not query-friendly for set-membership lookups (acceptable — not a current need)

### Option B: Separate `section_schedules` table (one row per weekday)

- ✅ Pro: Normalized; easy to query "which sections meet on day X"
- ❌ Con: Requires a join on every calendar load to resolve meeting days
- ❌ Con: "Inherit from course" requires either no rows (ambiguous with "meets zero days") or a sentinel
- ❌ Con: Over-engineered for 1–7 boolean flags

### Option C: JSONB `settings` column on `sections`

- ✅ Pro: Extensible for future per-section settings beyond meeting days
- ❌ Con: Loose schema — no column-level validation, harder to reason about NULL-means-inherit
- ❌ Con: YAGNI; no other per-section settings are planned

## Implementation notes

- Migration: `drizzle/0012_section_meeting_days.sql` — `ALTER TABLE "sections" ADD COLUMN "meeting_days" text;`
- Schema: `src/db/schema/calendar.ts` — `meetingDays: text("meeting_days")`
- API: `src/app/api/sections/route.ts` — new PATCH handler validates id (UUID), name (1–80 chars), period (≤20 chars), meetingDays (CSV of 1–7, or null); owner-scoped through the course
- Calendar: `src/app/calendar/page.tsx` — placement moves from per-course to per-row (`rowCalendars` memo), each row resolving `section.meetingDays ?? course.courseMeetingDays`
- Tests: `tests/api/sections.test.ts` — PATCH coverage for validation, owner scoping, dedup/sort, and null-reset

## Links

- PR #676 — implementation
- Issue #669 — per-section calendar settings (this is the first slice)
- ADR-0045 — prior course-level scoping decision (related calendar surface)
