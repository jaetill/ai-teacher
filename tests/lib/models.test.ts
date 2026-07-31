import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { MODELS } from "../../src/lib/models";

// #613: model IDs live in exactly one file. The scan below is the enforcement:
// if a route hardcodes a "claude-" model string again, this test fails and
// points at the file.

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(entry)) acc.push(p);
  }
  return acc;
}

describe("central model registry", () => {
  it("every registered ID looks like a real Anthropic model ID", () => {
    for (const id of Object.values(MODELS)) {
      expect(id).toMatch(/^claude-[a-z0-9-]+$/);
    }
  });

  it('no "claude-" model literal appears in src/ outside src/lib/models.ts', () => {
    const root = join(__dirname, "../../src");
    const offenders: string[] = [];
    for (const file of walk(root)) {
      if (file.endsWith(join("lib", "models.ts"))) continue;
      const content = readFileSync(file, "utf8");
      // Only flag model-ID-shaped strings ("claude-<family>-<version>"), not
      // prose mentioning Claude.
      if (/["'`]claude-(opus|sonnet|haiku)-[a-z0-9-]+["'`]/.test(content)) {
        offenders.push(file.slice(root.length + 1));
      }
    }
    expect(offenders).toEqual([]);
  });
});
