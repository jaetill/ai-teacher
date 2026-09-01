import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// Ratchet: no API route may return a 5xx the operator can't see.
//
// Every server-side failure must go through apiError()/refuse() (error_events
// row + Sentry event) or be immediately preceded by logErrorEvent(). Until
// 2026-09-01 twenty-two routes caught their own errors, console.error'd them,
// and returned a bare Response — Vercel keeps the status code but not the body,
// and Sentry never heard about any of them. This test keeps that from creeping
// back one route at a time.
//
// 4xx is deliberately out of scope: "Unauthorized" ×85 is noise, not signal.

const API_ROOT = path.resolve(__dirname, "../../src/app/api");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name === "route.ts") out.push(p);
  }
  return out;
}

const BARE_5XX = /status:\s*5\d\d\b/;
const LOOKBACK_LINES = 12;

describe("API routes: every 5xx is logged", () => {
  const files = walk(API_ROOT);

  it("finds the route files", () => {
    expect(files.length).toBeGreaterThan(40);
  });

  for (const file of files) {
    const rel = path.relative(API_ROOT, file).replace(/\\/g, "/");
    it(rel, () => {
      const lines = readFileSync(file, "utf8").split("\n");
      const offenders: string[] = [];
      lines.forEach((line, i) => {
        if (!BARE_5XX.test(line)) return;
        const window = lines.slice(Math.max(0, i - LOOKBACK_LINES), i + 1).join("\n");
        const logged =
          /\b(apiError|refuse|logErrorEvent)\s*\(/.test(window);
        if (!logged) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
      });
      expect(offenders, "bare 5xx — route it through apiError()/refuse()").toEqual([]);
    });
  }
});
