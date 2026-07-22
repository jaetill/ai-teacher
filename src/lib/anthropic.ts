// Lazy, shared Anthropic client.
//
// Routes must NOT construct `new Anthropic()` at module scope: the SDK throws
// at construction when ANTHROPIC_API_KEY is unset, and Next's "collecting page
// data" build step imports every API route's module graph — so a module-scope
// client makes builds fail in any environment that scopes the var. Same
// deferral pattern as src/db/index.ts uses for DATABASE_URL.

import Anthropic from "@anthropic-ai/sdk";

let cached: Anthropic | undefined;

export function getAnthropic(): Anthropic {
  if (!cached) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Configure it in .env.local for local " +
          "dev, or in Vercel project settings.",
      );
    }
    cached = new Anthropic();
  }
  return cached;
}
