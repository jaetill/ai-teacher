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
import { courses } from "./courses";
import { standards } from "./standards";

export const units = pgTable(
  "units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    title: text("title").notNull(), // "Night & The Hiding Place"
    sortOrder: smallint("sort_order").notNull(),
    quarter: text("quarter"), // "Q1", "Q2", "Q3", "Q4"
    durationWeeks: smallint("duration_weeks").notNull(),
    summary: text("summary").notNull(), // AI-readable 2-3 sentence summary
    essentialQuestions: text("essential_questions"),
    anchorTexts: text("anchor_texts"),
    contentWarnings: text("content_warnings"),
    teacherNotes: text("teacher_notes"),
    aiGenerationContext: jsonb("ai_generation_context"), // Prompt/params that produced this
    source: text("source").notNull().default("ai"), // 'ai' | 'human' | 'ai_edited'
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_units_course").on(table.courseId, table.sortOrder)]
);

export const unitStandards = pgTable(
  "unit_standards",
  {
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    standardId: text("standard_id")
      .notNull()
      .references(() => standards.id, { onDelete: "cascade" }),
    emphasis: text("emphasis").notNull().default("primary"), // 'primary' | 'secondary' | 'review'
  },
  (table) => [
    primaryKey({ columns: [table.unitId, table.standardId] }),
    index("idx_unit_standards_standard").on(table.standardId),
  ]
);
