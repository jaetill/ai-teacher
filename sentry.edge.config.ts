/**
 * Sentry edge-runtime init per platform ADR-0009.
 * Auto-loaded by instrumentation.ts when NEXT_RUNTIME === "edge"
 * (i.e. for middleware and edge API routes).
 *
 * Smaller surface than server.config.ts because edge runtime can't
 * use the full Node.js Sentry feature set (no profiling, etc.).
 * PII scrubbing posture (ADR-0006): user.email + user.username deleted,
 * email-like substrings stripped from request envelope, breadcrumb
 * message/data fields, and exception value strings.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const environment = process.env.VERCEL_ENV ?? "development";
const release = process.env.VERCEL_GIT_COMMIT_SHA;

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    release,
    tracesSampleRate: environment === "production" ? 0.1 : 1.0,
    beforeSend(event) {
      if (event.user) {
        delete event.user.email;
        delete event.user.username;
      }
      const emailRe = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
      const redactString = (s: string) => s.replace(emailRe, "[REDACTED_EMAIL]");
      const redactStringFields = (obj: Record<string, unknown>) => {
        for (const k of Object.keys(obj)) {
          const v = obj[k];
          if (typeof v === "string") obj[k] = redactString(v);
        }
      };

      // event.request — edge middleware errors carry the raw request envelope
      // (URL, query params, custom headers). Scrub each field for PII (ADR-0006).
      const req = event.request as
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
          redactStringFields(req.query_string as Record<string, unknown>);
        }
        if (req.headers && typeof req.headers === "object") {
          redactStringFields(req.headers as Record<string, unknown>);
        }
        if (typeof req.data === "string") {
          req.data = redactString(req.data);
        } else if (req.data && typeof req.data === "object") {
          redactStringFields(req.data as Record<string, unknown>);
        }
      }

      const scrub = (b: { message?: string; data?: Record<string, unknown> }) => {
        if (b.message) b.message = redactString(b.message);
        if (b.data && typeof b.data === "object") redactStringFields(b.data);
        return b;
      };
      const bc: unknown = event.breadcrumbs;
      if (Array.isArray(bc)) {
        event.breadcrumbs = bc.map(scrub);
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
      for (const ex of event.exception?.values ?? []) {
        if (ex.value) ex.value = redactString(ex.value);
      }
      return event;
    },
  });
}
