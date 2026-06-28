import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Octokit before importing the route so the module-level client picks up the mock.
const mockIssuesCreate = vi.fn().mockResolvedValue({ data: { number: 99 } });
vi.mock("@octokit/rest", () => {
  function Octokit() {
    return { rest: { issues: { create: mockIssuesCreate } } };
  }
  return { Octokit };
});

// Mock next/server's NextRequest with a minimal implementation.
vi.mock("next/server", () => {
  class MockNextRequest {
    ip?: string;
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

function makeRequest(body: unknown, options: { ip?: string; xff?: string } = { ip: "1.2.3.4" }) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.xff !== undefined) headers["x-forwarded-for"] = options.xff;
  const req = new NextRequest("http://localhost/api/feedback", {
    method: "POST",
    body: JSON.stringify(body),
    headers,
  });
  if (options.ip !== undefined) {
    (req as unknown as { ip: string }).ip = options.ip;
  }
  return req;
}

describe("POST /api/feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GITHUB_TOKEN = "test-token";
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

  it("returns 400 when no IP can be determined (no request.ip, no X-Forwarded-For)", async () => {
    const req = makeRequest({ type: "bug", description: "Something broke on the login page." }, {});
    const res = await POST(req as unknown as import("next/server").NextRequest);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("bad_request");
  });

  it("prevents XFF spoofing — changing the leftmost XFF value does not create a new rate-limit bucket", async () => {
    const body = { type: "bug", description: "Rate-limit XFF spoofing test description here." };
    // 10 requests with different spoofed leading IPs but the same Vercel-appended real IP
    for (let i = 0; i < 10; i++) {
      const res = await POST(
        makeRequest(body, {
          xff: `192.0.2.${i}, 203.0.113.7`,
        }) as unknown as import("next/server").NextRequest,
      );
      expect(res.status).toBe(201);
    }
    // 11th request with yet another spoofed leading IP — must still hit the same bucket
    const res = await POST(
      makeRequest(body, {
        xff: "198.51.100.99, 203.0.113.7",
      }) as unknown as import("next/server").NextRequest,
    );
    expect(res.status).toBe(429);
  });
});
