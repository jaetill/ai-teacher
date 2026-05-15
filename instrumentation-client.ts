/**
 * Sentry browser SDK init per platform ADR-0009.
 * Auto-loaded by @sentry/nextjs for client-side rendering and hydration.
 *
 * PII-aware: scrubs email/username/form-input values per ADR-0006.
 *
 * No-ops gracefully if NEXT_PUBLIC_SENTRY_DSN is unset (e.g. local dev
 * without Sentry wired). Init has no side effects when DSN is empty.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const environment = process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development";
const release = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA;

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    release,
    tracesSampleRate: environment === "production" ? 0.1 : 1.0,
    // PII scrubbing per ADR-0006
    beforeSend(event) {
      if (event.user) {
        delete event.user.email;
        delete event.user.username;
      }
      // Sentry's Event.breadcrumbs is Breadcrumb[] in the public types but the
      // SDK also accepts the envelope-style { values: Breadcrumb[] } shape, and
      // both have been observed in beforeSend at runtime. Handle either without
      // throwing — a throw here causes Sentry to send the original event
      // unredacted, defeating PII scrubbing (ADR-0006).
      const bc: unknown = event.breadcrumbs;
      const scrub = (b: { category?: string; message?: string; data?: Record<string, unknown> }) => {
        if (b.category === "ui.input") {
          if (b.message) {
            b.message = b.message.replace(/value=".*?"/g, 'value="[REDACTED]"');
          }
          // Sentry stores the typed input value in breadcrumb.data.value on
          // recent SDK versions, independent of message. Redact unconditionally.
          if (b.data && typeof b.data === "object" && typeof b.data.value === "string") {
            b.data.value = "[REDACTED]";
          }
        }
        return b;
      };
      if (Array.isArray(bc)) {
        event.breadcrumbs = bc.map(scrub);
      } else if (bc && typeof bc === "object" && Array.isArray((bc as { values?: unknown }).values)) {
        const envelope = bc as {
          values: Array<{ category?: string; message?: string; data?: Record<string, unknown> }>;
        };
        envelope.values = envelope.values.map(scrub);
      }
      return event;
    },
    // Browser session replay - opt-in later if needed
    // replaysSessionSampleRate: 0.1,
    // replaysOnErrorSampleRate: 1.0,
  });
}
