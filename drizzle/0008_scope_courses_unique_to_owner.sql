ALTER TABLE "courses" DROP CONSTRAINT "uq_courses_grade_subject_year";
--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "uq_courses_grade_subject_year_owner" UNIQUE("grade","subject","school_year_id","owner_email");
