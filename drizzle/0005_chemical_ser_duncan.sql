ALTER TABLE "drive_folders" DROP CONSTRAINT "uq_drive_folders_key";--> statement-breakpoint
ALTER TABLE "drive_folders" ADD COLUMN "owner_email" text;--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "owner_email" text;--> statement-breakpoint
CREATE INDEX "idx_drive_folders_owner" ON "drive_folders" USING btree ("owner_email");--> statement-breakpoint
ALTER TABLE "drive_folders" ADD CONSTRAINT "uq_drive_folders_key_owner" UNIQUE("folder_key","owner_email");