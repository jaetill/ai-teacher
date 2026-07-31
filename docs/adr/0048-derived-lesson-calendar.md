# ADR-0048: Derived lesson calendar with `meeting_days` column and schedule placement engine

- **Status:** Proposed
- **Date:** 2026-07-31
- **Deciders:** Jason (product owner), Claude (architect review)
- **Tags:** schema, calendar, curriculum

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

The curriculum compiler produces ordered lessons within quarterly units, but lessons have no calendar presence — they exist as a sequence with no real dates. Teachers need to see lessons on actual school days so they can plan around holidays, snow days, assemblies, and non-standard meeting schedules (e.g. a class that meets only MWF).

How should we assign dates to lessons, and how should the system respond when a school day is lost (snow day, assembly)?

## Decision Drivers

- A snow day or schedule change should cascade automatically — the teacher should not have to manually reschedule every downstream lesson.
- The solution must support classes that don't meet every weekday (e.g. MWF only).
- The scaffold-era `lesson_schedules` table stores per-lesson dates, but maintaining per-row date state creates an N-row update problem on every calendar perturbation.
- The neon-http driver prohibits interactive transactions, making bulk per-lesson date updates risky (no rollback on partial failure).
- Lesson titles already encode day counts by convention (e.g. "The Giver: Ch. 13–23 (6 days)") — the system should honor that signal.

## Considered Options

- Sub-decision 1: How to represent lesson dates — stored vs. derived
- Sub-decision 2: Where to store per-course meeting days — new column vs. separate table

## Decision Outcome

We chose the bundle:

- Sub-decision 1 → **Derived placement** — lesson dates are computed client-side from three stored inputs (quarter spans, meeting days, no-school days) and never persisted.
- Sub-decision 2 → **`meeting_days` text column on `courses`** — a CSV of ISO weekday numbers (e.g. `"1,3,5"` for MWF).

The bundle is internally consistent because the placement engine needs meeting days as an input stream, and a per-course column is the simplest way to feed that stream without a join.

## Consequences

### Positive

- Snow-day resilience is free: toggling a no-school day removes one date from the stream and every downstream lesson shifts automatically — zero per-lesson state to update.
- No N-row update problem: adding/removing a snow day is one row in `terms` (type `no_school`), not N lesson-schedule rows.
- Day counts parsed from existing title conventions ("(6 days)") give accurate multi-day lesson spans with no manual entry.
- The `meeting_days` column has a safe default (`'1,2,3,4,5'` = Mon–Fri) so existing courses work unchanged.

### Negative

- Lesson dates are not queryable via SQL — any reporting or export that needs "lessons on date X" must run the placement engine, not a simple `WHERE date = ?`.
- The placement engine must be kept in sync between client and any future server-side consumer (currently client-only in `src/lib/schedule.ts`).
- Overflow (more lesson-days than available class days in a quarter) is flagged but not prevented — the teacher must resolve it manually.

### Neutral

- The scaffold-era `lesson_schedules` table is deliberately unused by this feature. It remains in the schema for now; a future ADR can decide whether to drop, reshape, or repurpose it.
- Quarter date spans and no-school days reuse the existing `terms` table (with `termType` values `'quarter'` and `'no_school'`), adding no new tables.

## Pros and Cons of the Options

### Sub-decision 1: How to represent lesson dates

| Option | Pros | Cons |
|---|---|---|
| **A: Stored per-lesson dates** (scaffold `lesson_schedules` approach) | Dates are SQL-queryable; simple `WHERE` for reporting | N-row cascade on every snow day; bulk update without transactions risks partial writes on neon-http; stale-state bugs when teacher edits calendar inputs but forgets to re-save |
| **B: Derived placement** (chosen) | Zero per-lesson state; snow-day cascade is automatic; impossible for stored dates to drift from inputs | Dates not SQL-queryable; placement logic must live in a shared module; overflow detection is informational only |

### Sub-decision 2: Where to store per-course meeting days

| Option | Pros | Cons |
|---|---|---|
| **A: `meeting_days` column on `courses`** (chosen) | No join; simple default; migration is one additive `ALTER TABLE` | Denormalized if multiple courses share a schedule (acceptable — each course is owned by one teacher and schedules diverge in practice) |
| **B: Separate `course_schedules` table** | Normalizes shared schedules; extensible for future schedule metadata | Adds a join on every calendar read; over-engineered for a single CSV attribute with no independent lifecycle |

## Implementation notes

- Migration: `drizzle/0011_course_meeting_days.sql` — `ALTER TABLE "courses" ADD COLUMN "meeting_days" text DEFAULT '1,2,3,4,5' NOT NULL;`
- Schema: `src/db/schema/courses.ts` — `meetingDays: text("meeting_days").notNull().default("1,2,3,4,5")`
- Placement engine: `src/lib/schedule.ts` — pure functions (`placeLessons`, `classDays`, `parseDayCount`, `parseMeetingDays`, `defaultQuarterSpans`)
- API route: `src/app/api/schedule/[courseId]/route.ts` — GET returns calendar inputs; PUT saves them (upsert quarter spans, replace no-school days, update meeting days)
- Calendar UI: `src/app/curriculum/calendar/[courseId]/page.tsx` — week-view calendar with live recomputation
- Tests: `tests/lib/schedule.test.ts` (13 engine tests), `tests/api/schedule.test.ts` (9 API tests)

## Links

- PR #665 — implementation
- Issue #646 — lesson calendar feature request
- ADR-0045 — courses unique constraint scoped to owner (related `courses` table change)
