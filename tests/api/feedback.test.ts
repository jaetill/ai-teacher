import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// vi.mock calls are hoisted, so any variables they reference must be created via vi.hoisted.
const { mockIssuesCreate, mockKvIncr, mockKvExpire, mockKvTtl } = vi.hoisted(() => ({
  mockIssuesCreate: vi.fn().mockResolvedValue({ data: { number: 99 } }),
  mockKvIncr: vi.fn(),
  mockKvExpire: vi.fn().mockResolvedValue(1),
  mockKvTtl: vi.fn().mockResolvedValue(3600),
}));

// Mock Octokit before importing the route so the module-level client picks up the mock.
vi.mock("@octokit/rest", () => {
  function Octokit() {
    return { rest: { issues: { create: mockIssuesCreate } } };
  }
  return { Octokit };
});

// Mock @vercel/kv — tests drive count via mockKvIncr's resolved value.
vi.mock("@vercel/kv", () => ({
  kv: {
    incr: mockKvIncr,
    expire: mockKvExpire,
    ttl: mockKvTtl,
  },
}));

// Mock next/server's NextRequest with a minimal implementation.
vi.mock("next/server", () => {
  class MockNextRequest {
    private _body: unknown;
    headers: Map<string, string>;
    constructor(
      _url: string,
      init?: { method?: string; body?: string; headers?: Record<string, string> },
    ) {
      this._body = init?.body ? JSON.parse(init.body) : {};
      this.headers = new Map(Object.entries(init?.headers ?? {}));
    }
    async json() {
      return this._body;
    }
  }
  return { NextRequest: MockNextRequest };
});

import { POST } from "../../src/app/api/feedback/route";
import { NextRequest } from "next/server";

function makeRequest(body: unknown, ip = "1.2.3.4") {
  return new NextRequest("http://localhost/api/feedback", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
  });
}

describe("POST /api/feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GITHUB_TOKEN = "test-token";
    // KV not configured by default so existing tests use the fail-open path.
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  });

  it("does not include submitter email in the GitHub issue body", async () => {
    const req = makeRequest({
      type: "bug",
      description: "Something broke on the login page.",
      email: "user@example.com",
    });
    await POST(req as unknown as import("next/server").NextRequest);

    expect(mockIssuesCreate).toHaveBeenCalledOnce();
    const issuedBody: string = mockIssuesCreate.mock.calls[0][0].body as string;
    expect(issuedBody).not.toContain("user@example.com");
    expect(issuedBody).not.toMatch(/- Email:/i);
  });

  it("does not include Source IP in the GitHub issue body", async () => {
    const req = makeRequest({ type: "bug", description: "Something broke on the login page." });
    await POST(req as unknown as import("next/server").NextRequest);

    expect(mockIssuesCreate).toHaveBeenCalledOnce();
    const issuedBody: string = mockIssuesCreate.mock.calls[0][0].body as string;
    expect(issuedBody).not.toMatch(/source ip/i);
    expect(issuedBody).not.toContain("1.2.3.4");
  });

  it("returns 201 with a feedback id", async () => {
    const req = makeRequest({ type: "feature", description: "Please add dark mode support here." });
    const res = await POST(req as unknown as import("next/server").NextRequest);

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.status).toBe("received");
    expect(json.id).toMatch(/^FB-/);
  });

  it("returns 400 for invalid type", async () => {
    const req = makeRequest({
      type: "spam",
      description: "This is a test description long enough.",
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);

    expect(res.status).toBe(400);
  });
});

describe("POST /api/feedback — distributed rate limiting (KV)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GITHUB_TOKEN = "test-token";
    process.env.KV_REST_API_URL = "https://test.kv.vercel.app";
    process.env.KV_REST_API_TOKEN = "test-kv-token";
    mockKvExpire.mockResolvedValue(1);
    mockKvTtl.mockResolvedValue(3600);
  });

  afterEach(() => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  });

  it("allows the request when count is within the limit", async () => {
    mockKvIncr.mockResolvedValue(1);
    const req = makeRequest({ type: "bug", description: "Something broke on the login page." });
    const res = await POST(req as unknown as import("next/server").NextRequest);

    expect(res.status).toBe(201);
    expect(mockKvIncr).toHaveBeenCalledWith("rl:fb:1.2.3.4");
    // First request in window — TTL must be stamped.
    expect(mockKvExpire).toHaveBeenCalledWith("rl:fb:1.2.3.4", 3600);
  });

  it("skips EXPIRE on subsequent requests within the same window", async () => {
    mockKvIncr.mockResolvedValue(5); // not the first request
    const req = makeRequest({ type: "bug", description: "Something broke on the login page." });
    await POST(req as unknown as import("next/server").NextRequest);

    expect(mockKvExpire).not.toHaveBeenCalled();
  });

  it("returns 429 with Retry-After when the limit is exceeded", async () => {
    mockKvIncr.mockResolvedValue(11); // over the limit of 10
    mockKvTtl.mockResolvedValue(1800);
    const req = makeRequest({ type: "bug", description: "Something broke on the login page." });
    const res = await POST(req as unknown as import("next/server").NextRequest);

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("1800");
    const json = await res.json();
    expect(json.error).toBe("rate_limited");
    expect(json.retry_after_seconds).toBe(1800);
  });

  it("fails open when KV throws so legitimate users are not blocked", async () => {
    mockKvIncr.mockRejectedValue(new Error("KV connection refused"));
    const req = makeRequest({ type: "feature", description: "Please add dark mode support here." });
    const res = await POST(req as unknown as import("next/server").NextRequest);

    // Should proceed to issue creation rather than 429/500.
    expect(res.status).toBe(201);
  });
});
