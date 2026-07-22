-- Consolidated replacement for the former hand-written migrations 0007-0010
-- (add_user_id_to_units, drive_folders_owner_email, scope_courses_unique_to_owner,
-- rate_limits). Those four had two fatal defects:
--   1. Their journal `when` timestamps predated 0005/0006, so the drizzle
--      migrator (which applies only entries newer than the last applied
--      migration) silently skipped them on any DB migrated past 0006.
--   2. They had no meta snapshots, so the next `drizzle-kit generate` would
--      re-emit all of their changes and wedge the migration pipeline.
-- This file is generated from the schema (snapshot 0007) and made idempotent,
-- because some databases may already have these changes (applied via
-- `drizzle-kit push` or manually) without them being recorded in the
-- migrations table.
CREATE TABLE IF NOT EXISTS "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "courses" DROP CONSTRAINT IF EXISTS "uq_courses_grade_subject_year";--> statement-breakpoint
ALTER TABLE "drive_folders" DROP CONSTRAINT IF EXISTS "uq_drive_folders_key";--> statement-breakpoint
ALTER TABLE "drive_folders" ADD COLUMN IF NOT EXISTS "owner_email" text;--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "user_id" text;--> statement-breakpoint
-- Drop-and-recreate so a pre-existing NULLS DISTINCT variant of the courses
-- constraint (the old hand-written 0009) is upgraded to NULLS NOT DISTINCT.
-- If existing duplicate rows block the constraint, skip it with a warning
-- rather than wedging the migration — the import route also dedupes in code.
DO $$
BEGIN
	ALTER TABLE "courses" DROP CONSTRAINT IF EXISTS "uq_courses_grade_subject_year_owner";
	ALTER TABLE "courses" ADD CONSTRAINT "uq_courses_grade_subject_year_owner" UNIQUE NULLS NOT DISTINCT("grade","subject","school_year_id","owner_email");
EXCEPTION
	WHEN unique_violation THEN
		RAISE WARNING 'uq_courses_grade_subject_year_owner not created: duplicate course rows exist (grade, subject, school_year_id, owner_email). Merge duplicates, then re-add the constraint.';
END $$;
--> statement-breakpoint
DO $$
BEGIN
	ALTER TABLE "drive_folders" DROP CONSTRAINT IF EXISTS "uq_drive_folders_key_owner";
	ALTER TABLE "drive_folders" ADD CONSTRAINT "uq_drive_folders_key_owner" UNIQUE NULLS NOT DISTINCT("folder_key","owner_email");
EXCEPTION
	WHEN unique_violation THEN
		RAISE WARNING 'uq_drive_folders_key_owner not created: duplicate drive_folders rows exist (folder_key, owner_email). Merge duplicates, then re-add the constraint.';
END $$;
