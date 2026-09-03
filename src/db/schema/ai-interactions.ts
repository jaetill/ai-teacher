import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

// ── AI Interaction Log ───
// One row per Anthropic call outside the copilot (the copilot writes its
// usage onto copilot_messages instead). Until 2026-09-03 this table existed
// and was never written; every route now records through
// src/lib/ai-usage.ts, and the token-weighted budget in rate-limit.ts is fed
// from the same numbers.
//
// Cost question this answers:
//   select route, model, count(*), sum(token_count_in), sum(token_count_out),
//          sum(cache_read_tokens)
//   from ai_interactions where created_at > now() - interval '7 days'
//   group by 1,2 order by 4 desc;

export const aiInteractions = pgTable(
  "ai_interactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: text("entity_type").notNull(), // 'unit' | 'lesson' | 'assessment' | 'differentiation' | 'communication' | …
    entityId: uuid("entity_id"), // NULL for actions that don't produce a stored entity
    action: text("action").notNull(), // 'generate' | 'regenerate' | 'refine' | 'classify' | 'summarize'
    promptSummary: text("prompt_summary"), // Abbreviated description of what was asked — never content
    model: text("model").notNull(),
    tokenCountIn: integer("token_count_in"),
    tokenCountOut: integer("token_count_out"),
    // Prompt-cache accounting (2026-09-03). cache_read is billed at ~10% of
    // input; cache_write at ~125%. Without these two the in/out columns
    // overstate the bill on every cached copilot turn.
    cacheReadTokens: integer("cache_read_tokens"),
    cacheWriteTokens: integer("cache_write_tokens"),
    // Who spent it and where. The budget is per user; the breakdown is per
    // route. Nullable so a row can still be written for a request whose
    // session had no email.
    ownerEmail: text("owner_email"),
    route: text("route"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_ai_interactions_entity").on(table.entityType, table.entityId),
    index("idx_ai_interactions_date").on(table.createdAt),
    index("idx_ai_interactions_owner_date").on(table.ownerEmail, table.createdAt),
  ]
);
