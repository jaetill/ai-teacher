import {
  pgTable,
  uuid,
  text,
  smallint,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";

export const materials = pgTable(
  "materials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    // 'reading' | 'activity' | 'rubric' | 'lesson' | 'assessment' | 'resource' | 'curriculum' | 'other'
    materialType: text("material_type").notNull(),
    // 'google_drive' | 'url' | 'inline'
    storageType: text("storage_type").notNull(),

    // ── Google Drive fields ───
    driveFileId: text("drive_file_id"),
    driveMimeType: text("drive_mime_type"),
    driveWebUrl: text("drive_web_url"),
    driveFolderId: text("drive_folder_id"),

    // The teacher's own unit grouping, captured from the source Drive subfolder
    // this file lived in at import time (e.g. "The Giver"). Nullable: legacy
    // imports and files dropped at the root of the scanned folder have none.
    // Used by build-curriculum to create units from her structure rather than
    // inventing them.
    sourceUnit: text("source_unit"),

    // ── Non-Drive fields ───
    url: text("url"),
    inlineContent: text("inline_content"),

    // AI-readable summary of what this material is
    description: text("description"),
    source: text("source").notNull().default("human"),
    // Who owns this material (#537/#554). Nullable for legacy rows imported
    // before the column existed — read paths treat NULL as legacy-shared, the
    // same convention as driveFolders.ownerEmail. All insert paths stamp it.
    ownerEmail: text("owner_email"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_materials_drive_file").on(table.driveFileId),
    index("idx_materials_type").on(table.materialType),
    index("idx_materials_owner_email").on(table.ownerEmail),
  ]
);

// Polymorphic join: material → lesson | assessment | unit
export const materialAttachments = pgTable(
  "material_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    attachableType: text("attachable_type").notNull(), // 'lesson' | 'assessment' | 'unit'
    attachableId: uuid("attachable_id").notNull(),
    role: text("role").notNull().default("supporting"), // 'primary' | 'supporting' | 'teacher_reference'
    sortOrder: smallint("sort_order").notNull().default(0),
  },
  (table) => [
    index("idx_material_attachments_target").on(
      table.attachableType,
      table.attachableId
    ),
    index("idx_material_attachments_material").on(table.materialId),
    unique("uq_material_attachment").on(
      table.materialId,
      table.attachableType,
      table.attachableId
    ),
  ]
);
