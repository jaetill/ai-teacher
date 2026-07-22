// Distributed rate limit backed by Postgres (ADR-0046), extracted from the
// feedback route so AI routes can share it. A single atomic upsert per call:
// insert a fresh row, or — on conflict — reset the window if it has expired,
// else increment. RETURNING gives the post-increment count, so the whole check
// is one round-trip with no read-modify-write race. Global across serverless
// instances, unlike a per-instance Map (#48).

import { db } from "@/db";
import { rateLimits } from "@/db/schema";
import { sql } from "drizzle-orm";

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number; // seconds
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const windowSeconds = Math.ceil(windowMs / 1000);
  const expired = sql`${rateLimits.windowStart} < now() - make_interval(secs => ${windowSeconds})`;
  const [row] = await db
    .insert(rateLimits)
    .values({ key, count: 1, windowStart: new Date() })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`CASE WHEN ${expired} THEN 1 ELSE ${rateLimits.count} + 1 END`,
        windowStart: sql`CASE WHEN ${expired} THEN now() ELSE ${rateLimits.windowStart} END`,
      },
    })
    .returning({ count: rateLimits.count, windowStart: rateLimits.windowStart });

  if (row.count > limit) {
    const elapsed = Date.now() - new Date(row.windowStart).getTime();
    const retryAfter = Math.max(1, Math.ceil((windowMs - elapsed) / 1000));
    return { allowed: false, retryAfter };
  }
  return { allowed: true };
}

// ── Shared budget for all Anthropic-calling routes ───
//
// Every route that spends Anthropic tokens draws from one per-user hourly
// bucket, so a runaway client (or an abused account) is capped regardless of
// which endpoint it hits. The default is generous for a single teacher doing
// a heavy import session; override with AI_RATE_LIMIT_PER_HOUR in the env.

const AI_WINDOW_MS = 60 * 60 * 1000;

function aiLimit(): number {
  const parsed = parseInt(process.env.AI_RATE_LIMIT_PER_HOUR ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 40;
}

/**
 * Check the shared per-user AI budget. Returns a ready-to-return 429 Response
 * when over budget, or null when the request may proceed.
 */
export async function checkAiRateLimit(
  userKey: string | null | undefined,
): Promise<Response | null> {
  const key = `ai:${userKey ?? "no-email"}`;
  const rl = await checkRateLimit(key, aiLimit(), AI_WINDOW_MS);
  if (rl.allowed) return null;
  return Response.json(
    { error: "rate_limited", retry_after_seconds: rl.retryAfter },
    { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
  );
}
