CREATE TABLE "error_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route" text NOT NULL,
	"status" smallint NOT NULL,
	"reason" text NOT NULL,
	"message" text NOT NULL,
	"owner_email" text,
	"conversation_id" uuid,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_error_events_date" ON "error_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_error_events_reason" ON "error_events" USING btree ("reason","created_at");--> statement-breakpoint
CREATE INDEX "idx_error_events_route" ON "error_events" USING btree ("route","status");