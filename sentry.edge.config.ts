/**
 * Sentry edge-runtime init per platform ADR-0009.
 * Auto-loaded by instrumentation.ts when NEXT_RUNTIME === "edge"
 * (i.e. for middleware and edge API routes).
 *
 * Smaller surface than server.config.ts because edge runtime can't
 * use the full Node.js Sentry feature set (no profiling, etc.).
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
  });
}
