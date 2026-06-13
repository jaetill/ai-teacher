ALTER TABLE "courses" ADD COLUMN "owner_email" text;
--> statement-breakpoint
CREATE INDEX "idx_courses_owner_email" ON "courses" USING btree ("owner_email");
