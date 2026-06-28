import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

// Distributed rate-limit counters (ADR-0046). One row per limiter key — e.g. the
// caller IP for the /api/feedback endpoint. Replaces the per-serverless-instance
// in-memory limiter that was ineffective on Vercel's multi-instance runtime (#48):
// each warm instance had its own Map, so the effective limit was N × the intended
// cap. A shared DB counter makes the limit global and correct.
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: timestamp("window_start", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
