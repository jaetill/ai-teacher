import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { courses } from "./courses";

// ── Curriculum Edit Log ───
// Tracks every manual edit the teacher makes in the curriculum editor.
// Serves two purposes: (1) future undo history, (2) AI training data
// for smarter imports (learn from teacher corrections).

export const curriculumEditLog = pgTable(
  "curriculum_edit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    // 'reorder_lesson' | 'move_lesson' | 'move_assessment' | 'retype_content'
    // | 'update_title' | 'update_metadata' | 'attach_material' | 'detach_material'
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(), // 'lesson' | 'assessment' | 'material' | 'unit'
    entityId: uuid("entity_id").notNull(),
    previousValue: jsonb("previous_value"), // snapshot of old state
    newValue: jsonb("new_value"), // snapshot of new state
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_edit_log_course").on(table.courseId),
    index("idx_edit_log_action").on(table.action),
    index("idx_edit_log_date").on(table.createdAt),
  ]
);
