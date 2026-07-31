// Central model registry (#613).
//
// Every Anthropic model ID used by the app lives here, keyed by the job it
// does — routes import a role, not a version string, so a model upgrade (or
// a retirement like fix/dead-model, 2026-07-23) is a one-line change instead
// of a grep across ten routes. tests/lib/models.test.ts enforces this: no
// "claude-" literal may appear in src/ outside this file.
//
// Retirement watch: when an API call fails with a model-not-found error, this
// file is the single place to update. (A proactive retired-model monitor —
// pinging /v1/models on a schedule — is deferred; see #613.)

export const MODELS = {
  /** Deep reasoning: copilot chat, communications drafts, year plan, differentiation. */
  reasoning: "claude-opus-4-6",
  /** Largest tier, used where quality was worth the latency (curriculum generator). */
  reasoningLarge: "claude-opus-4-8",
  /** Structured extraction: classify, standards inference, material linking, build. */
  structured: "claude-sonnet-4-6",
  /** Cheap bulk work: material summaries. */
  summarizer: "claude-haiku-4-5-20251001",
} as const;

export type ModelRole = keyof typeof MODELS;
