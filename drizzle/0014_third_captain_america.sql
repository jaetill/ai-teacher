ALTER TABLE "courses" DROP CONSTRAINT "uq_courses_grade_subject_year_owner";--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "track" text;--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "course_id" uuid;--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "term" text;--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_materials_placement" ON "materials" USING btree ("course_id","term");--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "uq_courses_grade_subject_track_year_owner" UNIQUE NULLS NOT DISTINCT("grade","subject","track","school_year_id","owner_email");