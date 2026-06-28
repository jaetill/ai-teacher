import { vi, describe, it, expect, beforeEach } from "vitest";

const initMock = vi.fn();

vi.mock("@sentry/nextjs", () => ({ init: initMock }));

type BeforeSend = (event: Record<string, unknown>) => Record<string, unknown> | null;

describe("instrumentation-client – beforeSend", () => {
  let beforeSend: BeforeSend;

  beforeEach(async () => {
    initMock.mockReset();
    vi.resetModules();
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://fake@o0.ingest.sentry.io/0";
    await import("../instrumentation-client");
    beforeSend = initMock.mock.calls[0][0].beforeSend as BeforeSend;
  });

  it("redacts ui.input breadcrumb message in envelope-style breadcrumbs", () => {
    const event = {
      breadcrumbs: { values: [{ category: "ui.input", message: 'value="secret"' }] },
    };
    const result = beforeSend(event)!;
    const envelope = result.breadcrumbs as { values: Array<{ message: string }> };
    expect(envelope.values[0].message).toBe('value="[REDACTED]"');
  });

  it("redacts ui.input breadcrumb message in array-style breadcrumbs", () => {
    const event = {
      breadcrumbs: [{ category: "ui.input", message: 'value="secret"' }],
    };
    const result = beforeSend(event)!;
    const bc = result.breadcrumbs as Array<{ message: string }>;
    expect(bc[0].message).toBe('value="[REDACTED]"');
  });

  it("does not redact non-ui.input breadcrumb messages", () => {
    const event = {
      breadcrumbs: { values: [{ category: "navigation", message: "/api/chat" }] },
    };
    const result = beforeSend(event)!;
    const envelope = result.breadcrumbs as { values: Array<{ message: string }> };
    expect(envelope.values[0].message).toBe("/api/chat");
  });

  it("redacts data.value on ui.input breadcrumb", () => {
    const event = {
      breadcrumbs: {
        values: [{ category: "ui.input", data: { value: "typed-secret" } }],
      },
    };
    const result = beforeSend(event)!;
    const envelope = result.breadcrumbs as {
      values: Array<{ data: Record<string, unknown> }>;
    };
    expect(envelope.values[0].data.value).toBe("[REDACTED]");
  });

  it("deletes user.email and user.username while preserving other user fields", () => {
    const event = { user: { email: "t@school.org", username: "teacher1", id: "42" } };
    const result = beforeSend(event)!;
    const user = result.user as Record<string, unknown>;
    expect(user.email).toBeUndefined();
    expect(user.username).toBeUndefined();
    expect(user.id).toBe("42");
  });

  it("handles event with no breadcrumbs without throwing", () => {
    const event = { message: "no breadcrumbs here" };
    expect(() => beforeSend(event)).not.toThrow();
    expect(beforeSend(event)).not.toBeNull();
  });

  it("does not call Sentry.init when DSN is absent", async () => {
    initMock.mockReset();
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    await import("../instrumentation-client");
    expect(initMock).not.toHaveBeenCalled();
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://fake@o0.ingest.sentry.io/0";
  });
});
