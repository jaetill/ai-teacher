import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  smallint,
  timestamp,
  index,
  unique,
  uniqueIndex,
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
    ownerEmail: text("owner_email"), // Google account email of the teacher who created this course
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
    unique("uq_courses_grade_subject_year_owner").on(
      table.grade,
      table.subject,
      table.schoolYearId,
      table.ownerEmail
    ),
    uniqueIndex("uq_courses_null_owner")
      .on(table.grade, table.subject, table.schoolYearId)
      .where(sql`owner_email IS NULL`),
  ]
);
