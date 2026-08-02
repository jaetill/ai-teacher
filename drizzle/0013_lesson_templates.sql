CREATE TABLE "lesson_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_email" text,
	"name" text NOT NULL,
	"description" text,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "lesson_template_id" uuid;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "template_id" uuid;--> statement-breakpoint
CREATE INDEX "idx_lesson_templates_owner" ON "lesson_templates" USING btree ("owner_email");