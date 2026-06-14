ALTER TABLE "courses" ADD COLUMN "owner_email" text;--> statement-breakpoint
CREATE INDEX "idx_courses_owner_email" ON "courses" USING btree ("owner_email");--> statement-breakpoint
ALTER TABLE "courses" DROP CONSTRAINT "uq_courses_grade_subject_year";--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "uq_courses_grade_subject_year" UNIQUE("grade","subject","school_year_id","owner_email");
