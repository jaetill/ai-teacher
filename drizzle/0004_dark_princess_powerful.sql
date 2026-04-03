CREATE TABLE "curriculum_edit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"previous_value" jsonb,
	"new_value" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "curriculum_edit_log" ADD CONSTRAINT "curriculum_edit_log_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_edit_log_course" ON "curriculum_edit_log" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "idx_edit_log_action" ON "curriculum_edit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_edit_log_date" ON "curriculum_edit_log" USING btree ("created_at");