ALTER TABLE "courses" DROP CONSTRAINT "uq_courses_grade_subject";--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "school_year_id" uuid;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_school_year_id_school_years_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "uq_courses_grade_subject_year" UNIQUE("grade","subject","school_year_id");