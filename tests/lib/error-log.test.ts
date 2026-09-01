import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockDbInsert, mockCapture } = vi.hoisted(() => ({
  mockDbInsert: vi.fn(),
  mockCapture: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { insert: mockDbInsert } }));
vi.mock("@/db/schema", () => ({ errorEvents: {} }));
vi.mock("@sentry/nextjs", () => ({ captureException: mockCapture }));

import { logErrorEvent, refuse, apiError } from "@/lib/error-log";

/** Minimal stand-in for the drizzle insert chain: .values() resolves. */
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

function insertFails(err: unknown) {
  mockDbInsert.mockReturnValue({
    values: () => Promise.reject(err),
  });
}

const BASE = {
  route: "/api/copilot",
  status: 413,
  reason: "attachments_too_large" as const,
  message: "Those files add up to more than 12MB altogether.",
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logErrorEvent", () => {
  it("writes the row the diagnosis needs", async () => {
    const captured = insertOk();

    await logErrorEvent({
      ...BASE,
      ownerEmail: "teacher@example.com",
      conversationId: "550e8400-e29b-41d4-a716-446655440000",
      detail: { attachmentBytes: 20_000_000, limit: 16_800_000 },
    });

    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      route: "/api/copilot",
      status: 413,
      reason: "attachments_too_large",
      message: BASE.message,
      ownerEmail: "teacher@example.com",
      conversationId: "550e8400-e29b-41d4-a716-446655440000",
      detail: { attachmentBytes: 20_000_000, limit: 16_800_000 },
    });
  });

  it("nulls the optional columns rather than writing undefined", async () => {
    const captured = insertOk();
    await logErrorEvent(BASE);
    expect(captured[0]).toMatchObject({
      ownerEmail: null,
      conversationId: null,
      detail: null,
    });
  });

  // The whole point of the helper. A logging failure must never escalate a
  // clear 413 into an opaque 500 — the user's error is the priority, the
  // breadcrumb is the bonus.
  it("swallows a database failure instead of throwing", async () => {
    insertFails(new Error("neon unreachable"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(logErrorEvent(BASE)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
  });

  it("survives a non-Error rejection", async () => {
    insertFails("string rejection");
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(logErrorEvent(BASE)).resolves.toBeUndefined();
  });
});

describe("refuse", () => {
  it("returns the message as plain text so the panel can show it verbatim", async () => {
    insertOk();
    const res = await refuse(BASE);

    expect(res.status).toBe(413);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    expect(await res.text()).toBe(BASE.message);
  });

  it("returns JSON where the route's contract is JSON", async () => {
    insertOk();
    const res = await refuse({ ...BASE, status: 403, reason: "forbidden", asJson: true });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: BASE.message });
  });

  it("logs every refusal it builds", async () => {
    const captured = insertOk();
    await refuse(BASE);
    expect(captured).toHaveLength(1);
  });

  it("still refuses when logging is broken", async () => {
    insertFails(new Error("neon unreachable"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await refuse(BASE);
    expect(res.status).toBe(413);
    expect(await res.text()).toBe(BASE.message);
  });
});

describe("Sentry forwarding", () => {
  it("does not bother Sentry with a 4xx — the user did that, not us", async () => {
    insertOk();
    await logErrorEvent(BASE);
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("forwards a 5xx with its cause and route/reason tags", async () => {
    insertOk();
    const cause = new Error("neon: connection reset");
    await logErrorEvent({ ...BASE, status: 500, reason: "write_failed", cause });
    expect(mockCapture).toHaveBeenCalledTimes(1);
    const [err, ctx] = mockCapture.mock.calls[0];
    expect(err).toBe(cause);
    expect(ctx.tags).toMatchObject({ route: "/api/copilot", reason: "write_failed", status: "500" });
  });

  it("synthesises an Error from the message when there is no cause", async () => {
    insertOk();
    await logErrorEvent({ ...BASE, status: 502, reason: "upstream_failed" });
    const [err] = mockCapture.mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe(BASE.message);
  });

  it("never writes the cause to Postgres", async () => {
    const captured = insertOk();
    await logErrorEvent({ ...BASE, status: 500, reason: "unhandled", cause: new Error("x") });
    expect(captured[0]).not.toHaveProperty("cause");
  });

  it("still returns when Sentry itself throws", async () => {
    insertOk();
    mockCapture.mockImplementationOnce(() => {
      throw new Error("sentry exploded");
    });
    await expect(
      logErrorEvent({ ...BASE, status: 500, reason: "unhandled" }),
    ).resolves.toBeUndefined();
  });
});

describe("apiError", () => {
  it("returns { error } JSON with the status, and logs it", async () => {
    const captured = insertOk();
    const res = await apiError("/api/x", 502, "upstream_failed", "Drive didn't answer.", {
      ownerEmail: "t@x.org",
      detail: { upstreamStatus: 503 },
    });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Drive didn't answer." });
    expect(captured[0]).toMatchObject({
      route: "/api/x",
      status: 502,
      reason: "upstream_failed",
      ownerEmail: "t@x.org",
      detail: { upstreamStatus: 503 },
    });
    expect(mockCapture).toHaveBeenCalledTimes(1);
  });

  it("spreads extra into the body but not into the row", async () => {
    const captured = insertOk();
    const res = await apiError("/api/x", 500, "ai_parse_failed", "Failed to parse", {
      extra: { raw: "not json" },
    });
    expect(await res.json()).toEqual({ error: "Failed to parse", raw: "not json" });
    expect(JSON.stringify(captured[0])).not.toContain("not json");
  });
});
