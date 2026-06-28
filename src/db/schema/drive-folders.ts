import { pgTable, uuid, text, timestamp, index, unique } from "drizzle-orm/pg-core";

export const driveFolders = pgTable(
  "drive_folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    folderKey: text("folder_key").notNull(), // e.g. "root", "grade_6_Q1_Lessons"
    driveId: text("drive_id").notNull(), // Google Drive folder ID
    name: text("name").notNull(), // Human-readable name shown in Drive
    parentKey: text("parent_key"), // folder_key of the parent (null for root)
    ownerEmail: text("owner_email"), // null for legacy single-tenant rows
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // NULLS NOT DISTINCT: treats (key, NULL) as equal, preventing duplicate legacy rows.
    // Must mirror drizzle/0008_drive_folders_owner_email.sql, which writes the
    // constraint as UNIQUE NULLS NOT DISTINCT — otherwise schema and migration drift.
    unique("uq_drive_folders_key_owner")
      .on(table.folderKey, table.ownerEmail)
      .nullsNotDistinct(),
    index("idx_drive_folders_drive_id").on(table.driveId),
    index("idx_drive_folders_parent_key").on(table.parentKey),
  ]
);
