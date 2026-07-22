import "@testing-library/jest-dom/vitest";

// The lazy Anthropic client (src/lib/anthropic.ts) refuses to construct
// without an API key; give tests a dummy so routes can be imported/executed.
// Tests never hit the real API — the SDK is mocked per-file.
process.env.ANTHROPIC_API_KEY ??= "test-key";
