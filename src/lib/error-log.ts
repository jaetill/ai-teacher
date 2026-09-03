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

import * as Sentry from "@sentry/nextjs";
import { db } from "@/db";
import { errorEvents } from "@/db/schema";
import { classifyAnthropicFailure, operatorAlertTitle } from "@/lib/anthropic-failure";

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
  | "drive_no_file_id"
  // Generic codes for routes migrated onto apiError() (2026-09-01). Prefer a
  // route-specific code above when one guard's identity matters; these exist
  // so a 5xx can never again be a bare Response with no row and no Sentry event.
  | "input_too_large"
  | "upstream_failed"
  | "ai_parse_failed"
  | "ai_empty_result"
  | "ai_truncated"
  | "write_failed"
  | "record_missing"
  | "config_missing"
  | "unhandled"
  // The Anthropic ACCOUNT is the problem, not the request. Set automatically
  // by logErrorEvent when `cause` carries the API's billing/auth signature.
  | "ai_billing_exhausted"
  | "ai_key_invalid";

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
  /**
   * The underlying error, when there is one. Forwarded to Sentry for 5xx so a
   * caught-and-converted failure still produces a stack trace somewhere. Never
   * written to Postgres.
   */
  cause?: unknown;
}

/**
 * Write one row. Never throws and never rejects: callers are on a path that is
 * already returning an error to the user, and a logging failure must not turn a
 * clear 413 into an opaque 500.
 */
export async function logErrorEvent(input: ErrorEventInput): Promise<void> {
  // ── Account-level Anthropic failures get their own reason and their own
  // Sentry issue, whatever the route called them. The whole point is that the
  // alert email says "credits ran out — swap the key", not "upstream_failed".
  const failure = input.cause !== undefined ? classifyAnthropicFailure(input.cause) : null;
  if (failure?.needsOperator) {
    input = {
      ...input,
      reason: failure.kind === "billing_exhausted" ? "ai_billing_exhausted" : "ai_key_invalid",
      detail: { ...(input.detail ?? {}), upstreamStatus: failure.status ?? null },
    };
    try {
      Sentry.captureMessage(operatorAlertTitle(failure), {
        level: "fatal",
        // One issue per kind, however many routes and users hit it.
        fingerprint: ["anthropic-account", failure.kind],
        tags: { route: input.route, reason: input.reason, anthropic_failure: failure.kind },
        extra: { apiMessage: failure.apiMessage, upstreamStatus: failure.status },
      });
    } catch {
      // Never let alerting change the outcome.
    }
  }

  // 5xx means *we* failed, not the user. Those belong in Sentry too — until
  // 2026-09-01 every route caught its own errors and console.error'd them, so
  // Sentry saw only the unhandled ones. captureException is a no-op when the
  // SDK isn't initialised (tests, missing DSN).
  if (input.status >= 500) {
    try {
      Sentry.captureException(
        input.cause instanceof Error ? input.cause : new Error(input.message),
        {
          tags: { route: input.route, reason: input.reason, status: String(input.status) },
          extra: { ...(input.detail ?? {}), cause: input.cause instanceof Error ? undefined : input.cause },
        }
      );
    } catch {
      // Sentry must never change the outcome either.
    }
  }
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

/**
 * The JSON-body shorthand most routes want: `{ error: message, ...extra }`
 * with the row and (for 5xx) the Sentry event written first.
 *
 *   return apiError(ROUTE, 502, "upstream_failed", "Drive didn't answer.", { cause: err });
 *
 * `extra` is spread into the response body (e.g. validation `errors`, a
 * `raw` AI reply for the UI to show) and is NOT logged — keep `detail` for the
 * measurements that are.
 */
export async function apiError(
  route: string,
  status: number,
  reason: ErrorReason,
  message: string,
  opts: {
    cause?: unknown;
    detail?: ErrorEventInput["detail"];
    ownerEmail?: string | null;
    conversationId?: string | null;
    extra?: Record<string, unknown>;
  } = {}
): Promise<Response> {
  // An account-level Anthropic failure overrides whatever the route was going
  // to say: "Classification failed, try again" is wrong advice when the
  // credits are gone. 503 so clients that retry on 5xx don't hammer it.
  const failure = opts.cause !== undefined ? classifyAnthropicFailure(opts.cause) : null;
  if (failure?.needsOperator) {
    message = failure.userMessage;
    status = 503;
  }
  await logErrorEvent({
    route,
    status,
    reason,
    message,
    cause: opts.cause,
    detail: opts.detail,
    ownerEmail: opts.ownerEmail,
    conversationId: opts.conversationId,
  });
  return Response.json(
    { error: message, ...(failure?.needsOperator ? { needsOperator: true } : {}), ...(opts.extra ?? {}) },
    { status },
  );
}
