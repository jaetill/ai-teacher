DROP INDEX "idx_materials_placement";--> statement-breakpoint
CREATE INDEX "idx_materials_placement" ON "materials" USING btree ("course_id");--> statement-breakpoint
ALTER TABLE "materials" DROP COLUMN "term";