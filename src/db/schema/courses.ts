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
    ownerEmail: text("owner_email"), // Google account email of the teacher who created this course
    // ISO weekdays this class meets, CSV ("1,2,3,4,5" = Mon-Fri). Feeds the
    // calendar's class-day stream (#646); lesson dates are derived from it.
    meetingDays: text("meeting_days").notNull().default("1,2,3,4,5"),
    // Default lesson template for this course (#647). NULL = fall back to the
    // Classic builtin, which is the shape every pre-template lesson has.
    lessonTemplateId: uuid("lesson_template_id"),
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
    // Scoped to owner_email (ADR-0045): each teacher owns their own course row
    // for the same grade/subject/year.
    // NULLS NOT DISTINCT: school_year_id is nullable (a fresh install has no
    // is_current school year), and with default NULLS DISTINCT semantics the
    // constraint never fires for NULL year rows — so onConflictDoNothing() in
    // import/build-curriculum silently created a duplicate course per import.
    // Matches the drive_folders constraint style.
    unique("uq_courses_grade_subject_year_owner")
      .on(table.grade, table.subject, table.schoolYearId, table.ownerEmail)
      .nullsNotDistinct(),
  ]
);
