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

/**
 * Add `amount` to a windowed counter and return the post-increment count.
 * The same upsert checkRateLimit has always used, generalised so the token
 * budget can add a call's whole cost in one round-trip.
 */
export async function bumpCounter(
  key: string,
  amount: number,
  windowMs: number,
): Promise<{ count: number; windowStart: Date }> {
  const windowSeconds = Math.ceil(windowMs / 1000);
  const expired = sql`${rateLimits.windowStart} < now() - make_interval(secs => ${windowSeconds})`;
  const [row] = await db
    .insert(rateLimits)
    .values({ key, count: amount, windowStart: new Date() })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`CASE WHEN ${expired} THEN ${amount} ELSE ${rateLimits.count} + ${amount} END`,
        windowStart: sql`CASE WHEN ${expired} THEN now() ELSE ${rateLimits.windowStart} END`,
      },
    })
    .returning({ count: rateLimits.count, windowStart: rateLimits.windowStart });
  return { count: row.count, windowStart: new Date(row.windowStart) };
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const row = await bumpCounter(key, 1, windowMs);

  // Opportunistic cleanup (#623): rate-limit rows are per-key and otherwise
  // live forever. Roughly 1-in-64 checks sweeps rows whose window ended more
  // than a day ago. Cheap, needs no cron, and race-free: a concurrently-used
  // key is simply re-inserted by its own next upsert. Failures are swallowed —
  // cleanup must never affect the rate-limit answer.
  if (Math.random() < 1 / 64) {
    try {
      await db
        .delete(rateLimits)
        .where(sql`${rateLimits.windowStart} < now() - interval '1 day'`);
    } catch (err) {
      console.warn("[rate-limit] opportunistic cleanup failed:", err);
    }
  }

  if (row.count > limit) {
    const elapsed = Date.now() - row.windowStart.getTime();
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

// ── Token-weighted budget (2026-09-03) ───
//
// The per-call limit above treats a 300-token classify and a 250k-token
// copilot turn with five PDFs as equal. This second bucket counts billable
// tokens (see billableTokens in ai-usage.ts) and is charged AFTER each call
// from the real `usage` — so one request can overshoot, but the next is
// refused. Default 2M tokens/hour: roughly fifteen heavy copilot turns, or a
// full four-quarter import, before it bites. Override with
// AI_TOKEN_LIMIT_PER_HOUR.

function aiTokenLimit(): number {
  const parsed = parseInt(process.env.AI_TOKEN_LIMIT_PER_HOUR ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2_000_000;
}

function tokenKey(userKey: string | null | undefined): string {
  return `ai-tokens:${userKey ?? "no-email"}`;
}

/** Charge a finished call's tokens to the user's hourly bucket. */
export async function chargeAiTokens(userKey: string, tokens: number): Promise<void> {
  if (tokens <= 0) return;
  await bumpCounter(tokenKey(userKey), tokens, AI_WINDOW_MS);
}

function rateLimited(retryAfter: number, reason: "rate_limited" | "token_budget_exhausted"): Response {
  return Response.json(
    { error: reason, retry_after_seconds: retryAfter },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

/**
 * Check the shared per-user AI budget — calls per hour AND tokens per hour.
 * Returns a ready-to-return 429 Response when over either, or null when the
 * request may proceed.
 */
export async function checkAiRateLimit(
  userKey: string | null | undefined,
): Promise<Response | null> {
  const key = `ai:${userKey ?? "no-email"}`;
  const rl = await checkRateLimit(key, aiLimit(), AI_WINDOW_MS);
  if (!rl.allowed) return rateLimited(rl.retryAfter ?? 60, "rate_limited");

  // Read-only peek at the token bucket: charging happens after the call.
  const [tok] = await db
    .select({ count: rateLimits.count, windowStart: rateLimits.windowStart })
    .from(rateLimits)
    .where(sql`${rateLimits.key} = ${tokenKey(userKey)} and ${rateLimits.windowStart} >= now() - make_interval(secs => ${Math.ceil(AI_WINDOW_MS / 1000)})`)
    .limit(1);
  if (tok && tok.count > aiTokenLimit()) {
    const elapsed = Date.now() - new Date(tok.windowStart).getTime();
    const retryAfter = Math.max(1, Math.ceil((AI_WINDOW_MS - elapsed) / 1000));
    return rateLimited(retryAfter, "token_budget_exhausted");
  }
  return null;
}
