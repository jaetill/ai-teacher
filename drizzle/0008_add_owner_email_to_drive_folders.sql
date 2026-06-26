ALTER TABLE "drive_folders" ADD COLUMN "owner_email" text;
ALTER TABLE "drive_folders" DROP CONSTRAINT "uq_drive_folders_key";
ALTER TABLE "drive_folders" ADD CONSTRAINT "uq_drive_folders_key" UNIQUE("folder_key","owner_email");
