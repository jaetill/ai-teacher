ALTER TABLE "materials" ADD COLUMN "owner_email" text;--> statement-breakpoint
CREATE INDEX "idx_materials_owner_email" ON "materials" USING btree ("owner_email");