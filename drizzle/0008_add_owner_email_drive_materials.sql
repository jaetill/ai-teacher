ALTER TABLE "drive_folders" ADD COLUMN "owner_email" text;
ALTER TABLE "materials" ADD COLUMN "owner_email" text;

-- Replace the single-column unique constraint with (folder_key, owner_email)
-- so two users can each own a "root" folder without colliding.
-- NULLs are distinct in Postgres unique indexes, so legacy rows (owner_email IS NULL)
-- are each still unique by folder_key alone — no backfill required.
ALTER TABLE "drive_folders" DROP CONSTRAINT "uq_drive_folders_key";
ALTER TABLE "drive_folders" ADD CONSTRAINT "uq_drive_folders_key_owner" UNIQUE ("folder_key", "owner_email");

CREATE INDEX "idx_drive_folders_owner_email" ON "drive_folders" ("owner_email");
