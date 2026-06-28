import { describe, it, expect, vi } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────
const { mockStreamFn } = vi.hoisted(() => ({
  mockStreamFn: vi.fn().mockReturnValue({
    [Symbol.asyncIterator]: async function* () {},
  }),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { stream: mockStreamFn };
  },
}));

import { getServerSession } from "next-auth";
import { POST } from "../../../src/app/api/differentiation/route";

const mockSession = vi.mocked(getServerSession);

function authedSession() {
  mockSession.mockResolvedValueOnce({ user: { email: "teacher@example.com" }, expires: "" });
}

function makeRequest(body: object) {
  return new Request("http://localhost/api/differentiation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  content: "Read the passage and answer the questions.",
  studentNeed: "ELL support",
  outputRequest: "Simplify vocabulary",
};

describe("POST /api/differentiation — session auth (401)", () => {
  it("returns 401 when called without a session", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
    expect(mockStreamFn).not.toHaveBeenCalled();
  });
});

describe("POST /api/differentiation — grade field validation (400)", () => {
  it("returns 400 when grade is a string (quota-bypass attempt)", async () => {
    authedSession();
    const body = { ...VALID_BODY, grade: "a".repeat(500_000) };
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/grade must be a number/i);
    expect(mockStreamFn).not.toHaveBeenCalled();
  });
});

describe("POST /api/differentiation — MAX_BYTES guard (413)", () => {
  it("returns 413 when combined field lengths exceed 50 000 chars", async () => {
    authedSession();
    // 50 001 chars total: all in content
    const body = { ...VALID_BODY, content: "a".repeat(50_001) };
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(413);
    expect(await res.text()).toMatch(/too large/i);
  });

  it("passes the guard when combined field lengths equal exactly 50 000 chars", async () => {
    authedSession();
    // distribute 50 000 chars across three fields
    const body = {
      content: "a".repeat(49_998),
      studentNeed: "b",
      outputRequest: "c",
    };
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(200);
  });

  it("counts studentNeed toward the total (413 triggered by studentNeed alone)", async () => {
    authedSession();
    const body = {
      content: "a",
      studentNeed: "b".repeat(50_000),
      outputRequest: "c",
    };
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(413);
  });

  it("counts outputRequest toward the total (413 triggered by outputRequest alone)", async () => {
    authedSession();
    const body = {
      content: "a",
      studentNeed: "b",
      outputRequest: "c".repeat(50_000),
    };
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(413);
  });
});
