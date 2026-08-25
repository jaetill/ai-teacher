import "@testing-library/jest-dom/vitest";

// The lazy Anthropic client (src/lib/anthropic.ts) refuses to construct
// without an API key; give tests a dummy so routes can be imported/executed.
// Tests never hit the real API — the SDK is mocked per-file.
process.env.ANTHROPIC_API_KEY ??= "test-key";

// jsdom has no layout, so it implements no scrolling. Components that keep a
// transcript pinned to the bottom call this on every render and would
// otherwise fail for a reason that has nothing to do with what is under test.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
