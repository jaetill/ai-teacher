import { pgTable, uuid, text, timestamp, unique } from "drizzle-orm/pg-core";

// Teacher overrides for glossary definitions. The default definitions live in
// code (src/lib/glossary-terms.ts — the app's inferred "best guess" at what
// each term means from how the teacher organizes her materials); this table
// stores only the rows she has rewritten in her own words. The glossary is a
// deliberately temporary alignment instrument: once teacher and app agree on
// vocabulary, her wording here becomes the source of truth for prompts/UI.

export const glossaryTerms = pgTable(
  "glossary_terms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    termKey: text("term_key").notNull(),
    definition: text("definition").notNull(),
    ownerEmail: text("owner_email"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // NULLS NOT DISTINCT to match the drive_folders/courses convention.
    unique("uq_glossary_term_owner")
      .on(table.termKey, table.ownerEmail)
      .nullsNotDistinct(),
  ]
);
