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
