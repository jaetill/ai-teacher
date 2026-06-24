-- ============================================================================
-- Migration 0008 — owner-scoped data model: backfill NULL owners, then NOT NULL
-- ============================================================================
--
--   >>> BEFORE APPLYING: replace EVERY occurrence of the literal
--   >>> '__OWNER_EMAIL__' below with the real owner's Google account email
--   >>> (the single live user of this app). Do NOT commit the real email —
--   >>> substitute it at apply time only. See drizzle/MIGRATION-0008-RUNBOOK.md.
--
-- APPLY ORDER (enforced by the runbook): replace placeholder -> apply this
-- migration to the DB -> THEN deploy the code. Deploying the NOT-NULL / no-null-
-- arm code before this backfill runs would 403 the owner out of their own
-- pre-migration (NULL-owner) rows.
--
-- The whole migration runs in ONE transaction (addresses #391): if any
-- statement fails, the backfill, NOT NULL, and constraint swap all roll back
-- together — no half-applied state.
--
-- NOTE: this file is hand-authored (not `drizzle-kit generate` output) because
-- the generator emits neither the backfill UPDATEs nor the BEGIN/COMMIT, and it
-- also re-adds units.user_id (a snapshot-lineage artifact from 0007). The
-- accompanying meta/0008_snapshot.json + _journal.json ARE generated and
-- correctly describe the resulting schema.
-- ============================================================================

BEGIN;
--> statement-breakpoint

-- ── 1. Backfill: claim every ownerless row for the real owner ────────────────
-- (Must precede the SET NOT NULL below, same transaction.)
UPDATE "courses"               SET "owner_email" = '__OWNER_EMAIL__' WHERE "owner_email" IS NULL;
--> statement-breakpoint
UPDATE "copilot_conversations" SET "owner_email" = '__OWNER_EMAIL__' WHERE "owner_email" IS NULL;
--> statement-breakpoint

-- ── 2. Enforce NOT NULL so a NULL owner can never recur ──────────────────────
ALTER TABLE "courses"               ALTER COLUMN "owner_email" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "copilot_conversations" ALTER COLUMN "owner_email" SET NOT NULL;
--> statement-breakpoint

-- ── 3. Widen the courses unique constraint to include owner_email ────────────
-- Old key (grade, subject, school_year_id) let one owner's course block another
-- owner from creating the same grade/subject/year. Owner-inclusive key removes
-- the cross-owner collision without any partial-NULL index.
ALTER TABLE "courses" DROP CONSTRAINT IF EXISTS "uq_courses_grade_subject_year";
--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "uq_courses_grade_subject_year"
  UNIQUE ("grade", "subject", "school_year_id", "owner_email");
--> statement-breakpoint

COMMIT;
