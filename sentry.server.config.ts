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
      return event;
    },
  });
}
