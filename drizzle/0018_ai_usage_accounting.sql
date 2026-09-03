ALTER TABLE "ai_interactions" ADD COLUMN "cache_read_tokens" integer;--> statement-breakpoint
ALTER TABLE "ai_interactions" ADD COLUMN "cache_write_tokens" integer;--> statement-breakpoint
ALTER TABLE "ai_interactions" ADD COLUMN "owner_email" text;--> statement-breakpoint
ALTER TABLE "ai_interactions" ADD COLUMN "route" text;--> statement-breakpoint
CREATE INDEX "idx_ai_interactions_owner_date" ON "ai_interactions" USING btree ("owner_email","created_at");