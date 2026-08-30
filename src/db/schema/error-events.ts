import {
  pgTable,
  uuid,
  text,
  smallint,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

// ── Error Events ───
// Every refusal or failure a user actually saw, with the measurements needed to
// tell which guard fired.
//
// This table exists because of the 2026-08-30 incident: Heidi's copilot turn
// came back 413 and the panel replaced the server's sentence with "Something
// went wrong." Vercel logs the status code but not the response body, so the
// question "which of the six 413 guards was it?" could not be answered after
// the fact — only narrowed by elimination. One row here would have answered it
// outright.
//
// PRIVACY: `detail` holds counts, byte sizes and limits — never message text,
// never file contents, never filenames. Her material stays in
// copilot_messages, which is scoped to her; this table is diagnostics.

export const errorEvents = pgTable(
  "error_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Which endpoint refused, e.g. '/api/copilot'.
    route: text("route").notNull(),
    // HTTP status returned to the browser.
    status: smallint("status").notNull(),
    // Stable machine code for grouping — 'attachments_too_large',
    // 'transcript_too_long', 'user_message_too_long', 'stream_failed', …
    // Never reword these; the whole point is that they group across releases.
    reason: text("reason").notNull(),
    // The exact sentence the user saw. Kept alongside the code so a support
    // question ("what did it say?") is answerable without redeploying.
    message: text("message").notNull(),
    ownerEmail: text("owner_email"),
    // Deliberately NOT a foreign key to copilot_conversations. Most refusals
    // happen before the conversation row is created, and a FK would make the
    // insert fail in exactly the cases worth recording.
    conversationId: uuid("conversation_id"),
    // Measurements only: { contextChars, messageCount, transcriptChars,
    // longestUserMessageChars, attachmentCount, attachmentBytes, limit }.
    detail: jsonb("detail"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_error_events_date").on(table.createdAt),
    index("idx_error_events_reason").on(table.reason, table.createdAt),
    index("idx_error_events_route").on(table.route, table.status),
  ]
);
