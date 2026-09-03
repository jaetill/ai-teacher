import { describe, it, expect, vi, beforeEach } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const { mockDbInsert, mockCharge } = vi.hoisted(() => ({
  mockDbInsert: vi.fn(),
  mockCharge: vi.fn(),
}));
vi.mock("@/db", () => ({ db: { insert: mockDbInsert } }));
vi.mock("@/db/schema", () => ({ aiInteractions: {} }));
vi.mock("@/lib/rate-limit", () => ({ chargeAiTokens: mockCharge }));

import { recordAiUsage, billableTokens } from "@/lib/ai-usage";

function insertOk() {
  const captured: unknown[] = [];
  mockDbInsert.mockReturnValue({
    values: (v: unknown) => {
      captured.push(v);
      return Promise.resolve();
    },
  });
  return captured;
}

const USAGE = {
  input_tokens: 1000,
  output_tokens: 200,
  cache_read_input_tokens: 5000,
  cache_creation_input_tokens: 400,
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  mockCharge.mockResolvedValue(undefined);
});

describe("billableTokens", () => {
  it("weights cache reads at 10% and cache writes at 125%", () => {
    // 1000 + 200 + 5000*0.1 + 400*1.25 = 2200
    expect(billableTokens(USAGE)).toBe(2200);
  });
  it("is 0 for a missing usage", () => {
    expect(billableTokens(null)).toBe(0);
    expect(billableTokens(undefined)).toBe(0);
  });
});

describe("recordAiUsage", () => {
  it("writes the row and charges the budget", async () => {
    const captured = insertOk();
    await recordAiUsage({
      route: "/api/x",
      ownerEmail: "t@x.org",
      model: "m",
      usage: USAGE,
      entityType: "unit",
      entityId: "u1",
      action: "generate",
      promptSummary: "build grade 6 Q1",
    });
    expect(captured[0]).toMatchObject({
      route: "/api/x",
      ownerEmail: "t@x.org",
      model: "m",
      tokenCountIn: 1000,
      tokenCountOut: 200,
      cacheReadTokens: 5000,
      cacheWriteTokens: 400,
      entityType: "unit",
      entityId: "u1",
      action: "generate",
    });
    expect(mockCharge).toHaveBeenCalledWith("t@x.org", 2200);
  });

  it("still writes a row (with null tokens) when the call failed and there is no usage", async () => {
    const captured = insertOk();
    await recordAiUsage({ route: "/api/x", model: "m", usage: null, entityType: "unit" });
    expect(captured[0]).toMatchObject({ tokenCountIn: null, tokenCountOut: null });
    expect(mockCharge).not.toHaveBeenCalled();
  });

  it("never throws: a dead database and a dead budget are both swallowed", async () => {
    mockDbInsert.mockReturnValue({ values: () => Promise.reject(new Error("neon down")) });
    mockCharge.mockRejectedValue(new Error("neon down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      recordAiUsage({ route: "/api/x", ownerEmail: "t@x.org", model: "m", usage: USAGE, entityType: "unit" }),
    ).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it("does not charge a budget when there is no owner to charge", async () => {
    insertOk();
    await recordAiUsage({ route: "/api/x", model: "m", usage: USAGE, entityType: "unit" });
    expect(mockCharge).not.toHaveBeenCalled();
  });
});

// Ratchet: every route that calls Anthropic records its usage. Until
// 2026-09-03 ai_interactions existed and was never written; this keeps the
// next Anthropic-calling route from repeating that.
describe("every Anthropic-calling route records usage", () => {
  const API_ROOT = path.resolve(__dirname, "../../src/app/api");
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (name === "route.ts") out.push(p);
    }
    return out;
  }
  it("recordAiUsage (or the copilot's chargeAiTokens) appears wherever getAnthropic() does", () => {
    const offenders: string[] = [];
    for (const file of walk(API_ROOT)) {
      const src = readFileSync(file, "utf8");
      if (!src.includes("getAnthropic()")) continue;
      if (src.includes("recordAiUsage(") || src.includes("chargeAiTokens(")) continue;
      offenders.push(path.relative(API_ROOT, file).replace(/\\/g, "/"));
    }
    expect(offenders).toEqual([]);
  });
});
