import { test, expect } from "@playwright/test";

// Smoke test: the landing page loads without throwing a runtime error.
// Intentionally does NOT assert on specific content — the page is under
// active development and content churns. This only guards "it renders."
test("landing page renders without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");

  expect(errors).toHaveLength(0);
});
