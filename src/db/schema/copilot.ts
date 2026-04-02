import {
  pgTable,
  uuid,
  text,
  smallint,
  integer,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

// ── Copilot Conversations ───
// Tracks full conversation threads so we can analyze what the teacher asks for.
// Intent categories help us identify feature opportunities.

export const copilotConversations = pgTable(
  "copilot_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title"), // Auto-generated or user-set summary
    // AI-assigned categories for analytics:
    // 'rubric' | 'lesson_plan' | 'activity' | 'assessment' | 'vocab'
    // 'parent_email' | 'admin_email' | 'differentiation' | 'brainstorm'
    // 'document_transform' | 'standard_alignment' | 'other'
    intentCategory: text("intent_category"),
    // Which grade/unit/lesson was the conversation about (if identifiable)
    relatedGrade: smallint("related_grade"),
    relatedUnitId: uuid("related_unit_id"),
    relatedLessonId: uuid("related_lesson_id"),
    // How useful was this conversation? (teacher can rate, or inferred from behavior)
    // 'used' = teacher copied/exported output, 'abandoned' = left mid-conversation
    outcome: text("outcome"), // 'used' | 'abandoned' | 'regenerated' | null
    messageCount: integer("message_count").notNull().default(0),
    // Structured context that was passed to the conversation
    systemContext: jsonb("system_context"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_copilot_conversations_intent").on(table.intentCategory),
    index("idx_copilot_conversations_grade").on(table.relatedGrade),
    index("idx_copilot_conversations_date").on(table.createdAt),
  ]
);

// ── Copilot Messages ───
// Individual messages within a conversation. Stored so we can:
// 1. Resume conversations across sessions
// 2. Analyze what types of prompts produce the best outputs
// 3. Find patterns in teacher requests that should become dedicated features

export const copilotMessages = pgTable(
  "copilot_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => copilotConversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // 'user' | 'assistant'
    content: text("content").notNull(),
    sortOrder: smallint("sort_order").notNull(),
    // For assistant messages: track generation metadata
    model: text("model"), // 'claude-opus-4-6', etc.
    tokenCountIn: integer("token_count_in"),
    tokenCountOut: integer("token_count_out"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_copilot_messages_conversation").on(
      table.conversationId,
      table.sortOrder
    ),
  ]
);
