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
      // Strip email-like substrings from breadcrumb message/url/data fields.
      // Server breadcrumbs are typically http/fetch/console category; any of
      // those can embed teacher or student identifiers in URLs, log lines,
      // or request bodies. Sentry's Event.breadcrumbs has been observed in
      // both the public Breadcrumb[] shape and the envelope { values: [] }
      // shape inside beforeSend — handle either without throwing, because a
      // throw here causes Sentry to send the original unredacted event.
      const emailRe = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
      const scrub = (b: { message?: string; data?: Record<string, unknown> }) => {
        if (b.message) b.message = b.message.replace(emailRe, "[REDACTED_EMAIL]");
        if (b.data && typeof b.data === "object") {
          for (const k of Object.keys(b.data)) {
            const v = b.data[k];
            if (typeof v === "string") b.data[k] = v.replace(emailRe, "[REDACTED_EMAIL]");
          }
        }
        return b;
      };
      const bc: unknown = event.breadcrumbs;
      if (Array.isArray(bc)) {
        event.breadcrumbs = bc.map(scrub);
      } else if (bc && typeof bc === "object" && Array.isArray((bc as { values?: unknown }).values)) {
        const envelope = bc as { values: Array<{ message?: string; data?: Record<string, unknown> }> };
        envelope.values = envelope.values.map(scrub);
      }
      return event;
    },
  });
}
