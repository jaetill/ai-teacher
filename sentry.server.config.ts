/**
 * Sentry server-side init per platform ADR-0009.
 * Auto-loaded by instrumentation.ts when NEXT_RUNTIME === "nodejs"
 * (i.e. for all API routes and server components).
 *
 * Same PII-scrubbing posture as client.
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
      // Email substring stripper applied across breadcrumbs and the HTTP
      // request envelope. Server-side errors carry both; either can embed
      // teacher or student identifiers (ADR-0006).
      const emailRe = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
      const redactString = (s: string) => s.replace(emailRe, "[REDACTED_EMAIL]");
      const redactStringFields = (obj: Record<string, unknown>) => {
        for (const k of Object.keys(obj)) {
          const v = obj[k];
          if (typeof v === "string") obj[k] = redactString(v);
        }
      };

      // event.request — Sentry's Node SDK auto-strips Authorization/Cookie
      // headers but keeps custom headers, the URL (with query string), and
      // the request body. Scrub each plus drop any header that looks
      // identifier-bearing.
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

      // event.breadcrumbs — Sentry has been observed to pass both the public
      // Breadcrumb[] shape and the envelope { values: [] } shape inside
      // beforeSend. Handle either without throwing; a throw causes Sentry to
      // send the original unredacted event.
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

      // event.exception.values[].value — runtime exception messages can embed
      // email addresses (e.g. DB constraint violations, upstream API errors).
      for (const ex of event.exception?.values ?? []) {
        if (ex.value) ex.value = redactString(ex.value);
      }
      return event;
    },
  });
}
