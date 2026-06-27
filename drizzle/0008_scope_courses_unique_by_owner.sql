-- Drop the owner-unscoped unique constraint so two teachers can hold
-- distinct course rows for the same grade/subject/year combination.
ALTER TABLE "courses" DROP CONSTRAINT "uq_courses_grade_subject_year";
--> statement-breakpoint
-- New constraint includes owner_email; NULL values are always treated as
-- distinct by PostgreSQL's UNIQUE, so legacy NULL-owner rows are unaffected.
ALTER TABLE "courses" ADD CONSTRAINT "uq_courses_grade_subject_year_owner" UNIQUE("grade","subject","school_year_id","owner_email");
