import {
  pgTable,
  uuid,
  text,
  smallint,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { courses } from "./courses";

export const materials = pgTable(
  "materials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    // 'reading' | 'activity' | 'rubric' | 'lesson' | 'assessment' | 'resource' | 'curriculum' | 'other'
    materialType: text("material_type").notNull(),
    // 'google_drive' | 'url' | 'inline'
    storageType: text("storage_type").notNull(),

    // ── Placement ───
    // Where this material sits in the curriculum, as data rather than as a
    // Drive folder path. Before these columns, a material's grade, term and
    // category existed only inside `drive_folders.folder_key`
    // ("grade_7_Q2_Lessons") — which made storage location and curriculum
    // placement the same fact, and made import inherently per-quarter.
    //
    // Grade is deliberately absent: it is `courses.grade`, one join away.
    // Storing it again invites the two copies to disagree.
    courseId: uuid("course_id").references(() => courses.id, {
      onDelete: "cascade",
    }),
    // 'Summer' | 'Q1'..'Q4' | 'YearPlan'. Nullable on purpose: a material can
    // belong to a course without belonging to a term, the same way the
    // hand-made "Where I'm From Poem" unit does.
    term: text("term"),
    // 'Curriculum' | 'Lessons' | 'Activities' | 'Assessments' | 'Resources'.
    // The teacher-facing bucket. Distinct from materialType, which is the
    // AI/display tag — the redundancy between the two is known debt.
    category: text("category"),

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
    // The pool query: "everything placed in this course, optionally this term."
    index("idx_materials_placement").on(table.courseId, table.term),
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
