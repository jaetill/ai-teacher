import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSentryConfig(nextConfig, {
  // Suppresses source-map upload logs in non-CI environments
  silent: !process.env.CI,

  // These are the same values you'll set as build-time env vars / CI secrets:
  // SENTRY_ORG=jaetill, SENTRY_PROJECT=ai-teacher, SENTRY_AUTH_TOKEN=<token>
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Upload source maps; @sentry/nextjs defaults to deleting them
  // after upload so they're not served to clients.
  widenClientFileUpload: true,

  // Reduce noise in production logs
  disableLogger: true,

  // Don't fail the build if Sentry's upload fails (e.g., token unset on
  // local dev). The runtime still works without source-map upload.
  errorHandler: (err) => {
    console.warn("[sentry] source-map upload skipped:", err.message);
  },
});
