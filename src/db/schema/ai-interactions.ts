import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

// ── AI Interaction Log ───
// Tracks non-copilot AI generation actions (curriculum, differentiation, etc.)
// Useful for understanding which features get used and how much they cost.

export const aiInteractions = pgTable(
  "ai_interactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: text("entity_type").notNull(), // 'unit' | 'lesson' | 'assessment' | 'differentiation' | 'communication'
    entityId: uuid("entity_id"), // NULL for actions that don't produce a stored entity
    action: text("action").notNull(), // 'generate' | 'regenerate' | 'refine'
    promptSummary: text("prompt_summary"), // Abbreviated description of what was asked
    model: text("model").notNull(),
    tokenCountIn: integer("token_count_in"),
    tokenCountOut: integer("token_count_out"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_ai_interactions_entity").on(table.entityType, table.entityId),
    index("idx_ai_interactions_date").on(table.createdAt),
  ]
);
