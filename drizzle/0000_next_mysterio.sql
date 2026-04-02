CREATE TABLE "ai_interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"action" text NOT NULL,
	"prompt_summary" text,
	"model" text NOT NULL,
	"token_count_in" integer,
	"token_count_out" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_standards" (
	"assessment_id" uuid NOT NULL,
	"standard_id" text NOT NULL,
	CONSTRAINT "assessment_standards_assessment_id_standard_id_pk" PRIMARY KEY("assessment_id","standard_id")
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"title" text NOT NULL,
	"assessment_type" text NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"description" text,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" text DEFAULT 'ai' NOT NULL,
	"ai_generation_context" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "copilot_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text,
	"intent_category" text,
	"related_grade" smallint,
	"related_unit_id" uuid,
	"related_lesson_id" uuid,
	"outcome" text,
	"message_count" integer DEFAULT 0 NOT NULL,
	"system_context" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "copilot_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"sort_order" smallint NOT NULL,
	"model" text,
	"token_count_in" integer,
	"token_count_out" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"grade" smallint NOT NULL,
	"subject" text DEFAULT 'ELA' NOT NULL,
	"description" text,
	"teacher_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_courses_grade_subject" UNIQUE("grade","subject")
);
--> statement-breakpoint
CREATE TABLE "lesson_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scheduled_unit_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"planned_date" date,
	"actual_date" date,
	"status" text DEFAULT 'planned' NOT NULL,
	"teacher_notes" text,
	CONSTRAINT "uq_lesson_schedule" UNIQUE("scheduled_unit_id","lesson_id")
);
--> statement-breakpoint
CREATE TABLE "lesson_standards" (
	"lesson_id" uuid NOT NULL,
	"standard_id" text NOT NULL,
	"coverage_type" text DEFAULT 'teaches' NOT NULL,
	CONSTRAINT "lesson_standards_lesson_id_standard_id_pk" PRIMARY KEY("lesson_id","standard_id")
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"title" text NOT NULL,
	"sort_order" smallint NOT NULL,
	"duration_minutes" smallint,
	"objectives" text[],
	"lesson_plan" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"teacher_notes" text,
	"source" text DEFAULT 'ai' NOT NULL,
	"ai_generation_context" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_id" uuid NOT NULL,
	"attachable_type" text NOT NULL,
	"attachable_id" uuid NOT NULL,
	"role" text DEFAULT 'supporting' NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "uq_material_attachment" UNIQUE("material_id","attachable_type","attachable_id")
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"material_type" text NOT NULL,
	"storage_type" text NOT NULL,
	"drive_file_id" text,
	"drive_mime_type" text,
	"drive_web_url" text,
	"drive_folder_id" text,
	"url" text,
	"inline_content" text,
	"description" text,
	"source" text DEFAULT 'human' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"planned_term_id" uuid,
	"planned_start" date,
	"planned_end" date,
	"actual_start" date,
	"actual_end" date,
	"status" text DEFAULT 'planned' NOT NULL,
	"notes" text,
	CONSTRAINT "uq_scheduled_unit" UNIQUE("section_id","unit_id")
);
--> statement-breakpoint
CREATE TABLE "school_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_years_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"school_year_id" uuid NOT NULL,
	"name" text NOT NULL,
	"period" text,
	"student_count" smallint,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "standards" (
	"id" text PRIMARY KEY NOT NULL,
	"grade" smallint NOT NULL,
	"strand_code" text NOT NULL,
	"strand_name" text NOT NULL,
	"subcategory" text,
	"indicator" text,
	"description" text NOT NULL,
	"parent_id" text,
	"framework" text DEFAULT 'VA_SOL_2024' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_year_id" uuid NOT NULL,
	"term_type" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" smallint NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"parent_term_id" uuid
);
--> statement-breakpoint
CREATE TABLE "unit_standards" (
	"unit_id" uuid NOT NULL,
	"standard_id" text NOT NULL,
	"emphasis" text DEFAULT 'primary' NOT NULL,
	CONSTRAINT "unit_standards_unit_id_standard_id_pk" PRIMARY KEY("unit_id","standard_id")
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"title" text NOT NULL,
	"sort_order" smallint NOT NULL,
	"duration_weeks" smallint NOT NULL,
	"summary" text NOT NULL,
	"essential_questions" text,
	"anchor_texts" text,
	"content_warnings" text,
	"teacher_notes" text,
	"ai_generation_context" jsonb,
	"source" text DEFAULT 'ai' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assessment_standards" ADD CONSTRAINT "assessment_standards_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_standards" ADD CONSTRAINT "assessment_standards_standard_id_standards_id_fk" FOREIGN KEY ("standard_id") REFERENCES "public"."standards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_messages" ADD CONSTRAINT "copilot_messages_conversation_id_copilot_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."copilot_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_schedules" ADD CONSTRAINT "lesson_schedules_scheduled_unit_id_scheduled_units_id_fk" FOREIGN KEY ("scheduled_unit_id") REFERENCES "public"."scheduled_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_schedules" ADD CONSTRAINT "lesson_schedules_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_standards" ADD CONSTRAINT "lesson_standards_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_standards" ADD CONSTRAINT "lesson_standards_standard_id_standards_id_fk" FOREIGN KEY ("standard_id") REFERENCES "public"."standards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_attachments" ADD CONSTRAINT "material_attachments_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_units" ADD CONSTRAINT "scheduled_units_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_units" ADD CONSTRAINT "scheduled_units_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_units" ADD CONSTRAINT "scheduled_units_planned_term_id_terms_id_fk" FOREIGN KEY ("planned_term_id") REFERENCES "public"."terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_school_year_id_school_years_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standards" ADD CONSTRAINT "standards_parent_id_standards_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."standards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms" ADD CONSTRAINT "terms_school_year_id_school_years_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms" ADD CONSTRAINT "terms_parent_term_id_terms_id_fk" FOREIGN KEY ("parent_term_id") REFERENCES "public"."terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_standards" ADD CONSTRAINT "unit_standards_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_standards" ADD CONSTRAINT "unit_standards_standard_id_standards_id_fk" FOREIGN KEY ("standard_id") REFERENCES "public"."standards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ai_interactions_entity" ON "ai_interactions" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_ai_interactions_date" ON "ai_interactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_assessment_standards_standard" ON "assessment_standards" USING btree ("standard_id");--> statement-breakpoint
CREATE INDEX "idx_assessments_unit" ON "assessments" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "idx_copilot_conversations_intent" ON "copilot_conversations" USING btree ("intent_category");--> statement-breakpoint
CREATE INDEX "idx_copilot_conversations_grade" ON "copilot_conversations" USING btree ("related_grade");--> statement-breakpoint
CREATE INDEX "idx_copilot_conversations_date" ON "copilot_conversations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_copilot_messages_conversation" ON "copilot_messages" USING btree ("conversation_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_courses_grade" ON "courses" USING btree ("grade");--> statement-breakpoint
CREATE INDEX "idx_lesson_schedules_sunit" ON "lesson_schedules" USING btree ("scheduled_unit_id");--> statement-breakpoint
CREATE INDEX "idx_lesson_schedules_date" ON "lesson_schedules" USING btree ("planned_date");--> statement-breakpoint
CREATE INDEX "idx_lesson_standards_standard" ON "lesson_standards" USING btree ("standard_id");--> statement-breakpoint
CREATE INDEX "idx_lessons_unit" ON "lessons" USING btree ("unit_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_material_attachments_target" ON "material_attachments" USING btree ("attachable_type","attachable_id");--> statement-breakpoint
CREATE INDEX "idx_material_attachments_material" ON "material_attachments" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "idx_materials_drive_file" ON "materials" USING btree ("drive_file_id");--> statement-breakpoint
CREATE INDEX "idx_materials_type" ON "materials" USING btree ("material_type");--> statement-breakpoint
CREATE INDEX "idx_scheduled_units_section" ON "scheduled_units" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "idx_scheduled_units_unit" ON "scheduled_units" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "idx_sections_course_year" ON "sections" USING btree ("course_id","school_year_id");--> statement-breakpoint
CREATE INDEX "idx_standards_grade" ON "standards" USING btree ("grade");--> statement-breakpoint
CREATE INDEX "idx_standards_strand" ON "standards" USING btree ("grade","strand_code");--> statement-breakpoint
CREATE INDEX "idx_terms_year" ON "terms" USING btree ("school_year_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_unit_standards_standard" ON "unit_standards" USING btree ("standard_id");--> statement-breakpoint
CREATE INDEX "idx_units_course" ON "units" USING btree ("course_id","sort_order");