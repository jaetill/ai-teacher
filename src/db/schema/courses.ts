import {
  pgTable,
  uuid,
  text,
  smallint,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { schoolYears } from "./calendar";

export const courses = pgTable(
  "courses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(), // "Grade 8 English Language Arts"
    grade: smallint("grade").notNull(), // 6, 7, or 8
    subject: text("subject").notNull().default("ELA"),
    schoolYearId: uuid("school_year_id").references(() => schoolYears.id),
    description: text("description"), // Rich context for AI
    teacherNotes: text("teacher_notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_courses_grade").on(table.grade),
    unique("uq_courses_grade_subject_year").on(
      table.grade,
      table.subject,
      table.schoolYearId
    ),
  ]
);
