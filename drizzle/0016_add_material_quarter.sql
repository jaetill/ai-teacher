DROP INDEX "idx_materials_placement";--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "quarter" text;--> statement-breakpoint
CREATE INDEX "idx_materials_placement" ON "materials" USING btree ("course_id","quarter");