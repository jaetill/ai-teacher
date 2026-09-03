import { describe, it, expect, vi, beforeEach } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { classifyAnthropicFailure, operatorAlertTitle } from "@/lib/anthropic-failure";

// Build an APIError the way the SDK does from a real response body.
function sdkError(status: number, message: string, type = "invalid_request_error") {
  return Anthropic.APIError.generate(
    status,
    { type: "error", error: { type, message } },
    message,
    new Headers(),
  );
}

describe("classifyAnthropicFailure", () => {
  it("recognises the credit-exhausted 400 as an operator problem", () => {
    const f = classifyAnthropicFailure(
      sdkError(400, "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."),
    );
    expect(f.kind).toBe("billing_exhausted");
    expect(f.needsOperator).toBe(true);
    expect(f.userMessage).toMatch(/credits have run out/);
    expect(f.userMessage).toMatch(/Jason has been notified/);
    expect(f.status).toBe(400);
  });

  it("recognises a revoked/invalid key (401) as an operator problem", () => {
    const f = classifyAnthropicFailure(sdkError(401, "invalid x-api-key", "authentication_error"));
    expect(f.kind).toBe("key_invalid");
    expect(f.needsOperator).toBe(true);
    expect(f.userMessage).toMatch(/rejected this app's access key/);
  });

  it("treats 403 as a key/org problem too", () => {
    expect(classifyAnthropicFailure(sdkError(403, "permission denied", "permission_error")).kind).toBe("key_invalid");
  });

  it("does NOT treat an ordinary 400 (bad request) as billing", () => {
    const f = classifyAnthropicFailure(sdkError(400, "messages: at least one message is required"));
    expect(f.kind).toBe("unknown");
    expect(f.needsOperator).toBe(false);
  });

  it("marks 429 / 529 / 5xx as transient, not operator", () => {
    for (const s of [429, 529, 500, 503]) {
      const f = classifyAnthropicFailure(sdkError(s, "overloaded", "overloaded_error"));
      expect(f.kind).toBe("transient");
      expect(f.needsOperator).toBe(false);
      expect(f.userMessage).toMatch(/busy/);
    }
  });

  it("handles non-SDK errors without throwing", () => {
    const f = classifyAnthropicFailure(new Error("socket hang up"));
    expect(f.kind).toBe("unknown");
    expect(f.needsOperator).toBe(false);
    expect(classifyAnthropicFailure(undefined).needsOperator).toBe(false);
    expect(classifyAnthropicFailure("string").needsOperator).toBe(false);
  });
});

describe("operatorAlertTitle", () => {
  it("puts the fix in the title", () => {
    const t = operatorAlertTitle(classifyAnthropicFailure(sdkError(400, "credit balance is too low")));
    expect(t).toMatch(/^ACTION NEEDED/);
    expect(t).toMatch(/jaetill org/);
    expect(t).toMatch(/ai-billing\.md/);
  });
});

// ── error-log integration: the classification changes the row, the Sentry
// event, and (via apiError) what the user sees.
const { mockDbInsert, mockCapture, mockCaptureMessage } = vi.hoisted(() => ({
  mockDbInsert: vi.fn(),
  mockCapture: vi.fn(),
  mockCaptureMessage: vi.fn(),
}));
vi.mock("@/db", () => ({ db: { insert: mockDbInsert } }));
vi.mock("@/db/schema", () => ({ errorEvents: {} }));
vi.mock("@sentry/nextjs", () => ({ captureException: mockCapture, captureMessage: mockCaptureMessage }));

import { apiError } from "@/lib/error-log";

describe("apiError with an Anthropic account failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rewrites reason, message and status, and raises a distinct fatal Sentry issue", async () => {
    const captured: unknown[] = [];
    mockDbInsert.mockReturnValue({ values: (v: unknown) => (captured.push(v), Promise.resolve()) });

    const res = await apiError("/api/import/classify", 502, "upstream_failed", "Classification failed", {
      cause: sdkError400(),
      ownerEmail: "t@x.org",
    });

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/credits have run out/);
    expect(body.needsOperator).toBe(true);

    expect(captured[0]).toMatchObject({
      reason: "ai_billing_exhausted",
      status: 503,
      detail: { upstreamStatus: 400 },
    });

    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
    const [title, ctx] = mockCaptureMessage.mock.calls[0];
    expect(title).toMatch(/^ACTION NEEDED: Anthropic credits exhausted/);
    expect(ctx.level).toBe("fatal");
    expect(ctx.fingerprint).toEqual(["anthropic-account", "billing_exhausted"]);
  });

  it("leaves a transient upstream failure alone", async () => {
    mockDbInsert.mockReturnValue({ values: () => Promise.resolve() });
    const res = await apiError("/api/x", 502, "upstream_failed", "Classification failed", {
      cause: sdkError(529, "Overloaded", "overloaded_error"),
    });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("Classification failed");
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });
});

function sdkError400() {
  return sdkError(400, "Your credit balance is too low to access the Anthropic API.");
}
