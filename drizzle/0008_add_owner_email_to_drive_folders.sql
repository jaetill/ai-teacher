ALTER TABLE "drive_folders" ADD COLUMN "owner_email" text;
--> statement-breakpoint
ALTER TABLE "drive_folders" DROP CONSTRAINT "uq_drive_folders_key";
--> statement-breakpoint
ALTER TABLE "drive_folders" ADD CONSTRAINT "uq_drive_folders_key" UNIQUE NULLS NOT DISTINCT ("folder_key","owner_email");
