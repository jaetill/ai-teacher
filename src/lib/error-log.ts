// Record what a user was told, and why, in Postgres.
//
// The 2026-08-30 incident: a copilot turn returned 413, the panel swallowed the
// server's sentence, and Vercel's logs carry the status code but not the body.
// Six different guards return 413 from that one route, so afterwards the only
// available method was elimination. `refuse()` exists so that can't recur — it
// builds the Response and writes the row in one call, which means a refusal
// path cannot be added later that forgets to log.
//
// Two rules hold this together:
//   1. Logging must never change the outcome. Every write is wrapped; a dead
//      database still returns the user's error, just without the breadcrumb.
//   2. `detail` carries measurements, never content. See error-events.ts.

import { db } from "@/db";
import { errorEvents } from "@/db/schema";

/** Machine codes. Stable across releases — grouping depends on it. */
export type ErrorReason =
  | "invalid_json"
  | "missing_messages"
  | "bad_conversation_id"
  | "context_too_large"
  | "too_many_messages"
  | "user_message_too_long"
  | "transcript_too_long"
  | "too_many_attachments"
  | "malformed_attachment"
  | "attachments_too_large"
  | "unauthorized"
  | "forbidden"
  | "stream_failed"
  // accept-draft: Google rejected the write, or returned nothing usable.
  | "drive_create_failed"
  | "drive_no_file_id";

export interface ErrorEventInput {
  route: string;
  status: number;
  reason: ErrorReason;
  /** The exact text the user sees. Stored so support questions are answerable. */
  message: string;
  ownerEmail?: string | null;
  conversationId?: string | null;
  /** Counts, byte sizes and limits only — never message text or file contents. */
  detail?: Record<string, number | string | boolean | null>;
}

/**
 * Write one row. Never throws and never rejects: callers are on a path that is
 * already returning an error to the user, and a logging failure must not turn a
 * clear 413 into an opaque 500.
 */
export async function logErrorEvent(input: ErrorEventInput): Promise<void> {
  try {
    await db.insert(errorEvents).values({
      route: input.route,
      status: input.status,
      reason: input.reason,
      message: input.message,
      ownerEmail: input.ownerEmail ?? null,
      conversationId: input.conversationId ?? null,
      detail: input.detail ?? null,
    });
  } catch (err) {
    // Console is the fallback of last resort — Vercel keeps it even when
    // Postgres is the thing that's broken.
    console.error(
      `[error-log] could not record ${input.reason}:`,
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Build the refusal the user gets, and record it.
 *
 * Body shape mirrors what each caller already returned: plain text by default
 * (which is what the copilot panel reads and shows verbatim), JSON `{error}`
 * where the route's contract is JSON.
 */
export async function refuse(
  input: ErrorEventInput & { asJson?: boolean }
): Promise<Response> {
  await logErrorEvent(input);
  return input.asJson
    ? Response.json({ error: input.message }, { status: input.status })
    : new Response(input.message, {
        status: input.status,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
}
