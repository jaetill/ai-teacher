import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockInsert, mockSelect, mockDelete } = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockSelect: vi.fn(),
  mockDelete: vi.fn(),
}));
vi.mock("@/db", () => ({ db: { insert: mockInsert, select: mockSelect, delete: mockDelete } }));
vi.mock("@/db/schema", () => ({
  rateLimits: { key: "key", count: "count", windowStart: "window_start" },
}));

import { bumpCounter, checkAiRateLimit, chargeAiTokens } from "@/lib/rate-limit";

/** The upsert chain: insert().values().onConflictDoUpdate().returning() → rows */
function upsertReturns(row: { count: number; windowStart: Date }) {
  const values = vi.fn();
  mockInsert.mockReturnValue({
    values: (v: unknown) => {
      values(v);
      return { onConflictDoUpdate: () => ({ returning: () => Promise.resolve([row]) }) };
    },
  });
  return values;
}
/** select().from().where().limit() → rows */
function selectReturns(rows: unknown[]) {
  mockSelect.mockReturnValue({
    from: () => ({ where: () => ({ limit: () => Promise.resolve(rows) }) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Math, "random").mockReturnValue(0.99); // never trigger opportunistic cleanup
  delete process.env.AI_TOKEN_LIMIT_PER_HOUR;
  delete process.env.AI_RATE_LIMIT_PER_HOUR;
});
afterEach(() => vi.restoreAllMocks());

describe("bumpCounter", () => {
  it("inserts the amount (not 1) and returns the post-increment count", async () => {
    const values = upsertReturns({ count: 4200, windowStart: new Date() });
    const res = await bumpCounter("ai-tokens:t@x.org", 4200, 3_600_000);
    expect(values.mock.calls[0][0]).toMatchObject({ key: "ai-tokens:t@x.org", count: 4200 });
    expect(res.count).toBe(4200);
  });
});

describe("chargeAiTokens", () => {
  it("charges the user's token key", async () => {
    const values = upsertReturns({ count: 10, windowStart: new Date() });
    await chargeAiTokens("t@x.org", 10);
    expect(values.mock.calls[0][0]).toMatchObject({ key: "ai-tokens:t@x.org", count: 10 });
  });
  it("is a no-op for zero", async () => {
    await chargeAiTokens("t@x.org", 0);
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe("checkAiRateLimit", () => {
  it("passes when both the call count and the token bucket are under budget", async () => {
    upsertReturns({ count: 1, windowStart: new Date() });
    selectReturns([{ count: 500_000, windowStart: new Date() }]);
    expect(await checkAiRateLimit("t@x.org")).toBeNull();
  });

  it("passes when the token bucket has no row yet", async () => {
    upsertReturns({ count: 1, windowStart: new Date() });
    selectReturns([]);
    expect(await checkAiRateLimit("t@x.org")).toBeNull();
  });

  it("429s with token_budget_exhausted when the hourly token budget is spent", async () => {
    upsertReturns({ count: 1, windowStart: new Date() });
    selectReturns([{ count: 2_000_001, windowStart: new Date(Date.now() - 600_000) }]);
    const res = await checkAiRateLimit("t@x.org");
    expect(res?.status).toBe(429);
    const body = await res!.json();
    expect(body.error).toBe("token_budget_exhausted");
    // ~50 minutes left in the hour window
    expect(body.retry_after_seconds).toBeGreaterThan(2900);
    expect(body.retry_after_seconds).toBeLessThanOrEqual(3000);
  });

  it("honours AI_TOKEN_LIMIT_PER_HOUR", async () => {
    process.env.AI_TOKEN_LIMIT_PER_HOUR = "1000";
    upsertReturns({ count: 1, windowStart: new Date() });
    selectReturns([{ count: 1001, windowStart: new Date() }]);
    expect((await checkAiRateLimit("t@x.org"))?.status).toBe(429);
  });

  it("the per-call limit still wins first", async () => {
    upsertReturns({ count: 41, windowStart: new Date() });
    const res = await checkAiRateLimit("t@x.org");
    expect(res?.status).toBe(429);
    expect((await res!.json()).error).toBe("rate_limited");
    expect(mockSelect).not.toHaveBeenCalled();
  });
});
