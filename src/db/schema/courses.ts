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
    // Google account email of the teacher who created this course.
    // NOT NULL since migration 0008 — every course is owner-scoped (see ADR-0024).
    ownerEmail: text("owner_email").notNull(),
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
    // owner_email is part of the unique key (migration 0008): two teachers may
    // each own a "Grade 8 ELA / 2025-2026" course without colliding.
    unique("uq_courses_grade_subject_year").on(
      table.grade,
      table.subject,
      table.schoolYearId,
      table.ownerEmail
    ),
  ]
);
