import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class {
      messages = { stream: vi.fn() };
    },
  };
});

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

import { getServerSession } from "next-auth";
import { POST } from "../../src/app/api/year-plan/route";

const mockedGetServerSession = vi.mocked(getServerSession);

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/year-plan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/year-plan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when called without a session", async () => {
    mockedGetServerSession.mockResolvedValue(null);

    const res = await POST(makeRequest({ grade: 7, schoolYear: "2025-2026", standards: "7.RL.1" }));

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });
});
