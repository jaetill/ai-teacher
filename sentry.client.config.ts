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
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((b) => {
          if (b.category === "ui.input" && b.message) {
            b.message = b.message.replace(/value=".*?"/g, 'value="[REDACTED]"');
          }
          return b;
        });
      }
      return event;
    },
    // Browser session replay - opt-in later if needed
    // replaysSessionSampleRate: 0.1,
    // replaysOnErrorSampleRate: 1.0,
  });
}
