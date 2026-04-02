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
    // 'presentation' | 'worksheet' | 'reading' | 'rubric' | 'answer_key' | 'handout' | 'video_link' | 'other'
    materialType: text("material_type").notNull(),
    // 'google_drive' | 'url' | 'inline'
    storageType: text("storage_type").notNull(),

    // ── Google Drive fields ───
    driveFileId: text("drive_file_id"),
    driveMimeType: text("drive_mime_type"),
    driveWebUrl: text("drive_web_url"),
    driveFolderId: text("drive_folder_id"),

    // ── Non-Drive fields ───
    url: text("url"),
    inlineContent: text("inline_content"),

    // AI-readable summary of what this material is
    description: text("description"),
    source: text("source").notNull().default("human"),
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
