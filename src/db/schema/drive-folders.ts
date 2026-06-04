import { pgTable, uuid, text, timestamp, index, unique } from "drizzle-orm/pg-core";

export const driveFolders = pgTable(
  "drive_folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    folderKey: text("folder_key").notNull(), // e.g. "root", "grade_6_Q1_Lessons"
    driveId: text("drive_id").notNull(), // Google Drive folder ID
    name: text("name").notNull(), // Human-readable name shown in Drive
    parentKey: text("parent_key"), // folder_key of the parent (null for root)
    ownerEmail: text("owner_email"), // session.user.email — scopes rows per teacher
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Per-user uniqueness: each teacher has their own folder tree
    unique("uq_drive_folders_key_owner").on(table.folderKey, table.ownerEmail),
    index("idx_drive_folders_drive_id").on(table.driveId),
    index("idx_drive_folders_parent_key").on(table.parentKey),
    index("idx_drive_folders_owner").on(table.ownerEmail),
  ]
);
