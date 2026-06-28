/**
 * Sentry server-side init per platform ADR-0009.
 * Auto-loaded by instrumentation.ts when NEXT_RUNTIME === "nodejs"
 * (i.e. for all API routes and server components).
 *
 * Same PII-scrubbing posture as client. The scrubbing runs on BOTH error
 * events (beforeSend) AND performance transactions (beforeSendTransaction) —
 * traces carry the request envelope, breadcrumbs, and spans (whose
 * descriptions/data can embed SQL, URLs, and identifiers), so they need the
 * same redaction as errors (#25).
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const environment = process.env.VERCEL_ENV ?? "development";
const release = process.env.VERCEL_GIT_COMMIT_SHA;

// Shared scrubber for error AND transaction events. Generic over the event
// shape so it satisfies both beforeSend (ErrorEvent) and beforeSendTransaction
// (TransactionEvent) without widening either return type.
function scrubEvent<T extends object>(event: T): T {
  const e = event as Record<string, unknown>;
  const user = e.user as { email?: string; username?: string } | undefined;
  if (user) {
    delete user.email;
    delete user.username;
  }

  // Email substring stripper applied across breadcrumbs, the HTTP request
  // envelope, spans, and the transaction name. Server-side events carry these;
  // any can embed teacher or student identifiers (ADR-0006).
  const emailRe = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
  const redactString = (s: string) => s.replace(emailRe, "[REDACTED_EMAIL]");
  const redactDeep = (obj: Record<string, unknown>) => {
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (typeof v === "string") obj[k] = redactString(v);
      else if (Array.isArray(v))
        v.forEach((item) => {
          if (item && typeof item === "object" && !Array.isArray(item))
            redactDeep(item as Record<string, unknown>);
        });
      else if (v && typeof v === "object") redactDeep(v as Record<string, unknown>);
    }
  };

  // event.request — Sentry's Node SDK auto-strips Authorization/Cookie
  // headers but keeps custom headers, the URL (with query string), and
  // the request body. Scrub each plus drop any header that looks
  // identifier-bearing.
  const req = e.request as
    | {
        url?: string;
        query_string?: string | Record<string, string>;
        headers?: Record<string, string>;
        data?: unknown;
      }
    | undefined;
  if (req) {
    if (typeof req.url === "string") req.url = redactString(req.url);
    if (typeof req.query_string === "string") {
      req.query_string = redactString(req.query_string);
    } else if (req.query_string && typeof req.query_string === "object") {
      redactDeep(req.query_string as Record<string, unknown>);
    }
    if (req.headers && typeof req.headers === "object") {
      redactDeep(req.headers as Record<string, unknown>);
    }
    if (typeof req.data === "string") {
      req.data = redactString(req.data);
    } else if (req.data && typeof req.data === "object") {
      redactDeep(req.data as Record<string, unknown>);
    }
  }

  // event.breadcrumbs — Sentry has been observed to pass both the public
  // Breadcrumb[] shape and the envelope { values: [] } shape inside
  // beforeSend. Handle either without throwing; a throw causes Sentry to
  // send the original unredacted event.
  const scrub = (b: { message?: string; data?: Record<string, unknown> }) => {
    if (b.message) b.message = redactString(b.message);
    if (b.data && typeof b.data === "object") redactDeep(b.data);
    return b;
  };
  const bc: unknown = e.breadcrumbs;
  if (Array.isArray(bc)) {
    e.breadcrumbs = bc.map(scrub);
  } else if (
    bc &&
    typeof bc === "object" &&
    Array.isArray((bc as { values?: unknown }).values)
  ) {
    const envelope = bc as {
      values: Array<{ message?: string; data?: Record<string, unknown> }>;
    };
    envelope.values = envelope.values.map(scrub);
  }

  // event.exception.values[].value — runtime exception messages can embed
  // email addresses (e.g. DB constraint violations, upstream API errors).
  const exception = e.exception as { values?: Array<{ value?: string }> } | undefined;
  for (const ex of exception?.values ?? []) {
    if (ex.value) ex.value = redactString(ex.value);
  }

  // event.spans — transaction events carry spans whose description/data can
  // embed SQL fragments, URLs with query params, or identifiers (#25).
  const spans = e.spans as
    | Array<{ description?: string; data?: Record<string, unknown> }>
    | undefined;
  if (Array.isArray(spans)) {
    for (const sp of spans) {
      if (typeof sp.description === "string") sp.description = redactString(sp.description);
      if (sp.data && typeof sp.data === "object") redactDeep(sp.data);
    }
  }

  // event.transaction — the transaction name (often a templated route, but can
  // carry an interpolated identifier). Scrub for safety.
  if (typeof e.transaction === "string") {
    e.transaction = redactString(e.transaction);
  }

  return event;
}

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    release,
    tracesSampleRate: environment === "production" ? 0.1 : 1.0,
    beforeSend(event) {
      return scrubEvent(event);
    },
    beforeSendTransaction(event) {
      return scrubEvent(event);
    },
  });
}
