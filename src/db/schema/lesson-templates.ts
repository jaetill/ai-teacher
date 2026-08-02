import { pgTable, uuid, text, jsonb, boolean, timestamp, index } from "drizzle-orm/pg-core";

// Lesson templates (#647) — the teacher's own definition of what a lesson
// contains, stored as data instead of hardcoded in the generator.
//
// Named and reusable rather than one-per-course: Heidi's own lesson titles
// already show at least two shapes ("Reading The Giver: Chapters 4-6" vs
// "Socratic Seminar: The Giver and Big Questions"), and forcing a seminar day
// through a reading day's fields would make the consistency report lie.
//
// Resolution order for a given lesson:
//   lessons.template_id  →  courses.lesson_template_id  →  the Classic builtin
// Both columns are nullable, so nothing needs a backfill: a lesson with no
// template resolves to Classic, whose single "activities" list is exactly the
// shape every pre-template lesson already has.
export const lessonTemplates = pgTable(
  "lesson_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Google account email of the teacher who owns it (ADR-0045 scoping).
    // NULL = a builtin, visible to everyone, not editable.
    ownerEmail: text("owner_email"),
    name: text("name").notNull(), // "Reading Day", "Socratic Seminar"
    description: text("description"),
    // TemplateField[] — see src/lib/lesson-template.ts for the shape and rules.
    fields: jsonb("fields").notNull().default([]),
    // The template new lessons get when their course doesn't name one.
    isDefault: boolean("is_default").notNull().default(false),
    // 'builtin' | 'derived' (AI read her existing lessons) | 'manual'
    source: text("source").notNull().default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_lesson_templates_owner").on(table.ownerEmail)],
);
