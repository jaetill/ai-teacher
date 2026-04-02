CREATE TABLE "drive_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"folder_key" text NOT NULL,
	"drive_id" text NOT NULL,
	"name" text NOT NULL,
	"parent_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_drive_folders_key" UNIQUE("folder_key")
);
--> statement-breakpoint
CREATE INDEX "idx_drive_folders_drive_id" ON "drive_folders" USING btree ("drive_id");--> statement-breakpoint
CREATE INDEX "idx_drive_folders_parent_key" ON "drive_folders" USING btree ("parent_key");