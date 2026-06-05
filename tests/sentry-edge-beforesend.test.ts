import { vi, describe, it, expect, beforeEach } from "vitest";

const initMock = vi.fn();

vi.mock("@sentry/nextjs", () => ({ init: initMock }));

type BeforeSend = (event: Record<string, unknown>) => Record<string, unknown> | null;

describe("sentry edge config – beforeSend", () => {
  let beforeSend: BeforeSend;

  beforeEach(async () => {
    initMock.mockReset();
    vi.resetModules();
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://fake@o0.ingest.sentry.io/0";
    await import("../sentry.edge.config");
    beforeSend = initMock.mock.calls[0][0].beforeSend as BeforeSend;
  });

  it("redacts email address from exception value", () => {
    const event = {
      exception: { values: [{ value: "error for user@example.com" }] },
    };
    const result = beforeSend(event)!;
    const values = (result.exception as { values: Array<{ value: string }> }).values;
    expect(values[0].value).toBe("error for [REDACTED_EMAIL]");
  });

  it("leaves exception value unchanged when no email present", () => {
    const event = {
      exception: { values: [{ value: "cannot read property of undefined" }] },
    };
    const result = beforeSend(event)!;
    const values = (result.exception as { values: Array<{ value: string }> }).values;
    expect(values[0].value).toBe("cannot read property of undefined");
  });

  it("handles missing exception gracefully", () => {
    const event = { message: "no exception here" };
    const result = beforeSend(event);
    expect(result).not.toBeNull();
  });

  it("redacts email address from breadcrumb message", () => {
    const event = {
      breadcrumbs: [{ message: "user admin@school.org clicked submit" }],
    };
    const result = beforeSend(event)!;
    const bc = result.breadcrumbs as Array<{ message: string }>;
    expect(bc[0].message).toBe("user [REDACTED_EMAIL] clicked submit");
  });

  it("deletes user.email and user.username", () => {
    const event = { user: { email: "t@school.org", username: "teacher1", id: "42" } };
    const result = beforeSend(event)!;
    const user = result.user as Record<string, unknown>;
    expect(user.email).toBeUndefined();
    expect(user.username).toBeUndefined();
    expect(user.id).toBe("42");
  });

  it("redacts email from request.url", () => {
    const event = {
      request: { url: "https://app.example.com/api?teacher=foo@school.com" },
    };
    const result = beforeSend(event)!;
    const req = result.request as { url: string };
    expect(req.url).toBe("https://app.example.com/api?teacher=[REDACTED_EMAIL]");
  });

  it("redacts email from request.query_string string", () => {
    const event = {
      request: { query_string: "email=teacher@school.com&other=value" },
    };
    const result = beforeSend(event)!;
    const req = result.request as { query_string: string };
    expect(req.query_string).toBe("email=[REDACTED_EMAIL]&other=value");
  });

  it("redacts email from request.query_string object", () => {
    const event = {
      request: { query_string: { email: "teacher@school.com", page: "1" } },
    };
    const result = beforeSend(event)!;
    const req = result.request as { query_string: Record<string, string> };
    expect(req.query_string.email).toBe("[REDACTED_EMAIL]");
    expect(req.query_string.page).toBe("1");
  });

  it("redacts email from request.headers", () => {
    const event = {
      request: { headers: { "x-user": "admin@school.org", "content-type": "application/json" } },
    };
    const result = beforeSend(event)!;
    const req = result.request as { headers: Record<string, string> };
    expect(req.headers["x-user"]).toBe("[REDACTED_EMAIL]");
    expect(req.headers["content-type"]).toBe("application/json");
  });

  it("redacts email from request.data string", () => {
    const event = {
      request: { data: "user=teacher@school.com" },
    };
    const result = beforeSend(event)!;
    const req = result.request as { data: string };
    expect(req.data).toBe("user=[REDACTED_EMAIL]");
  });

  it("redacts email from request.data object", () => {
    const event = {
      request: { data: { email: "teacher@school.com", action: "login" } },
    };
    const result = beforeSend(event)!;
    const req = result.request as { data: Record<string, string> };
    expect(req.data.email).toBe("[REDACTED_EMAIL]");
    expect(req.data.action).toBe("login");
  });

  it("handles missing request gracefully", () => {
    const event = { message: "no request attached" };
    const result = beforeSend(event);
    expect(result).not.toBeNull();
  });
});
