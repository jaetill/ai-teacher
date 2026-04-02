import {
  pgTable,
  uuid,
  text,
  smallint,
  timestamp,
  jsonb,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { units } from "./units";
import { standards } from "./standards";

export const lessons = pgTable(
  "lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    sortOrder: smallint("sort_order").notNull(),
    durationMinutes: smallint("duration_minutes"),
    objectives: text("objectives").array(), // TEXT[] — flat list, queryable
    // Structured AI content: opening, instruction, practice, closing, vocab, etc.
    lessonPlan: jsonb("lesson_plan").notNull().default({}),
    teacherNotes: text("teacher_notes"),
    source: text("source").notNull().default("ai"),
    aiGenerationContext: jsonb("ai_generation_context"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_lessons_unit").on(table.unitId, table.sortOrder)]
);

export const lessonStandards = pgTable(
  "lesson_standards",
  {
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    standardId: text("standard_id")
      .notNull()
      .references(() => standards.id, { onDelete: "cascade" }),
    // 'introduces' | 'teaches' | 'reinforces' | 'assesses'
    coverageType: text("coverage_type").notNull().default("teaches"),
  },
  (table) => [
    primaryKey({ columns: [table.lessonId, table.standardId] }),
    index("idx_lesson_standards_standard").on(table.standardId),
  ]
);
