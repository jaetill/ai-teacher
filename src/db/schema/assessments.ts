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

export const assessments = pgTable(
  "assessments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    // 'formative' | 'summative' | 'diagnostic' | 'exit_ticket'
    assessmentType: text("assessment_type").notNull(),
    sortOrder: smallint("sort_order").notNull().default(0),
    description: text("description"),
    // Structured: prompts[], rubric { criteria[] }, answer_key, time_limit
    content: jsonb("content").notNull().default({}),
    source: text("source").notNull().default("ai"),
    aiGenerationContext: jsonb("ai_generation_context"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_assessments_unit").on(table.unitId)]
);

export const assessmentStandards = pgTable(
  "assessment_standards",
  {
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "cascade" }),
    standardId: text("standard_id")
      .notNull()
      .references(() => standards.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.assessmentId, table.standardId] }),
    index("idx_assessment_standards_standard").on(table.standardId),
  ]
);
