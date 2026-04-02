import {
  pgTable,
  uuid,
  text,
  smallint,
  timestamp,
  date,
  boolean,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { courses } from "./courses";
import { units } from "./units";
import { lessons } from "./lessons";

// ── School Years ───

export const schoolYears = pgTable("school_years", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(), // "2025-2026"
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  isCurrent: boolean("is_current").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Terms (semesters & quarters, self-referencing) ───

export const terms = pgTable(
  "terms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolYearId: uuid("school_year_id")
      .notNull()
      .references(() => schoolYears.id, { onDelete: "cascade" }),
    termType: text("term_type").notNull(), // 'semester' | 'quarter'
    name: text("name").notNull(), // "Q1", "S1", "Quarter 2"
    sortOrder: smallint("sort_order").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    parentTermId: uuid("parent_term_id").references((): any => terms.id),
  },
  (table) => [
    index("idx_terms_year").on(table.schoolYearId, table.sortOrder),
  ]
);

// ── Sections (class periods — instances of a course) ───

export const sections = pgTable(
  "sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    schoolYearId: uuid("school_year_id")
      .notNull()
      .references(() => schoolYears.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // "Period 3" or "Block B"
    period: text("period"), // "3" or "B"
    studentCount: smallint("student_count"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_sections_course_year").on(table.courseId, table.schoolYearId),
  ]
);

// ── Scheduled Units (unit placed on calendar for a section) ───

export const scheduledUnits = pgTable(
  "scheduled_units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    plannedTermId: uuid("planned_term_id").references(() => terms.id),
    plannedStart: date("planned_start"),
    plannedEnd: date("planned_end"),
    actualStart: date("actual_start"),
    actualEnd: date("actual_end"),
    status: text("status").notNull().default("planned"), // 'planned' | 'in_progress' | 'completed' | 'skipped'
    notes: text("notes"),
  },
  (table) => [
    index("idx_scheduled_units_section").on(table.sectionId),
    index("idx_scheduled_units_unit").on(table.unitId),
    unique("uq_scheduled_unit").on(table.sectionId, table.unitId),
  ]
);

// ── Lesson Schedules (per-lesson planned vs actual dates) ───

export const lessonSchedules = pgTable(
  "lesson_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scheduledUnitId: uuid("scheduled_unit_id")
      .notNull()
      .references(() => scheduledUnits.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    plannedDate: date("planned_date"),
    actualDate: date("actual_date"),
    status: text("status").notNull().default("planned"), // 'planned' | 'taught' | 'skipped' | 'rescheduled'
    teacherNotes: text("teacher_notes"), // Post-lesson reflection
  },
  (table) => [
    index("idx_lesson_schedules_sunit").on(table.scheduledUnitId),
    index("idx_lesson_schedules_date").on(table.plannedDate),
    unique("uq_lesson_schedule").on(table.scheduledUnitId, table.lessonId),
  ]
);
