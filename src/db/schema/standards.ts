import { pgTable, text, smallint, timestamp, index } from "drizzle-orm/pg-core";

export const standards = pgTable(
  "standards",
  {
    id: text("id").primaryKey(), // e.g. "8.RL.2.A" — human/AI-readable
    grade: smallint("grade").notNull(), // 6, 7, or 8
    strandCode: text("strand_code").notNull(), // "RL", "RI", "W", etc.
    strandName: text("strand_name").notNull(), // "Reading Literary Text"
    subcategory: text("subcategory"), // "1", "2", "3" (sub-grouping)
    indicator: text("indicator"), // "A", "B", "C" (leaf node)
    description: text("description").notNull(), // Full standard text
    parentId: text("parent_id").references((): any => standards.id),
    framework: text("framework").notNull().default("VA_SOL_2024"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_standards_grade").on(table.grade),
    index("idx_standards_strand").on(table.grade, table.strandCode),
  ]
);
