ALTER TABLE "courses" DROP CONSTRAINT "uq_courses_grade_subject_year";
ALTER TABLE "courses" ADD CONSTRAINT "uq_courses_grade_subject_year_owner" UNIQUE ("grade", "subject", "school_year_id", "owner_email");
CREATE UNIQUE INDEX "uq_courses_null_owner" ON "courses" ("grade", "subject", "school_year_id") WHERE owner_email IS NULL;
