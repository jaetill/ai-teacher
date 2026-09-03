// Per-call Anthropic usage accounting.
//
// Two things happen after every model call:
//   1. A row in ai_interactions (or, for the copilot, the token columns on the
//      assistant's copilot_messages row) — so "what did this week cost, and
//      which feature spent it" is a query, not a guess.
//   2. The user's hourly TOKEN budget is charged, alongside the per-call one
//      checkAiRateLimit already enforces. A 300-token classify and a
//      250k-token copilot turn with five PDFs are not the same spend; only the
//      token bucket knows the difference.
//
// Neither may ever change the outcome of the request that produced them.
// recordAiUsage swallows every failure; the budget is charged AFTER the call
// (so a single request can overshoot once — that is the accepted trade for not
// paying a countTokens round-trip before every call).

import type Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db";
import { aiInteractions } from "@/db/schema";
import { chargeAiTokens } from "@/lib/rate-limit";

export interface AiUsageInput {
  /** e.g. "/api/import/build-curriculum" — the breakdown key. */
  route: string;
  ownerEmail?: string | null;
  model: string;
  /** `message.usage` from create() or finalMessage(). Null when the call failed. */
  usage: Anthropic.Messages.Usage | null | undefined;
  /** What the call was for — the ai_interactions.entity_type / action columns. */
  entityType: string;
  action?: string;
  entityId?: string | null;
  /** Abbreviated description of the ask. Never prompt text or file content. */
  promptSummary?: string | null;
}

/** Tokens the user's budget is charged for. Cache reads are cheap; count them at their billed weight. */
export function billableTokens(usage: Anthropic.Messages.Usage | null | undefined): number {
  if (!usage) return 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  // Anthropic pricing: cache read ≈ 0.1× input, cache write ≈ 1.25× input.
  return Math.round(
    usage.input_tokens + usage.output_tokens + cacheRead * 0.1 + cacheWrite * 1.25,
  );
}

/**
 * Record one call and charge the token budget. Never throws, never rejects.
 * Awaiting it costs one insert (~30 ms on Neon); do await it — an un-awaited
 * promise at the end of a serverless invocation may never run.
 */
export async function recordAiUsage(input: AiUsageInput): Promise<void> {
  const u = input.usage ?? null;
  try {
    await db.insert(aiInteractions).values({
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      action: input.action ?? "generate",
      promptSummary: input.promptSummary ?? null,
      model: input.model,
      tokenCountIn: u?.input_tokens ?? null,
      tokenCountOut: u?.output_tokens ?? null,
      cacheReadTokens: u?.cache_read_input_tokens ?? null,
      cacheWriteTokens: u?.cache_creation_input_tokens ?? null,
      ownerEmail: input.ownerEmail ?? null,
      route: input.route,
    });
  } catch (err) {
    console.error(
      `[ai-usage] could not record ${input.route}:`,
      err instanceof Error ? err.message : err,
    );
  }
  const tokens = billableTokens(u);
  if (tokens > 0 && input.ownerEmail) {
    try {
      await chargeAiTokens(input.ownerEmail, tokens);
    } catch (err) {
      console.error("[ai-usage] could not charge token budget:", err instanceof Error ? err.message : err);
    }
  }
}

/**
 * Usage from a MessageStream after it has been fully consumed. Tolerates a
 * stream that isn't a real SDK MessageStream (tests hand routes a bare async
 * iterable) and a finalMessage() that rejects — accounting never throws.
 */
export async function usageFromStream(
  stream: unknown,
): Promise<Anthropic.Messages.Usage | undefined> {
  const s = stream as { finalMessage?: () => Promise<{ usage?: Anthropic.Messages.Usage }> };
  if (typeof s?.finalMessage !== "function") return undefined;
  try {
    return (await s.finalMessage())?.usage;
  } catch {
    return undefined;
  }
}
