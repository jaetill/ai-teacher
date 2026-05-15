/**
 * Next.js instrumentation hook per https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 * Loads the right Sentry config for the runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  } else if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Re-export Sentry's onRequestError hook so unhandled errors in async
// server components get captured.
export { captureRequestError as onRequestError } from "@sentry/nextjs";
