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
import { POST } from "../../../src/app/api/communications/route";

const mockSession = vi.mocked(getServerSession);

function authedSession() {
  mockSession.mockResolvedValueOnce({ user: { email: "teacher@example.com" }, expires: "" });
}

function makeRequest(body: object) {
  return new Request("http://localhost/api/communications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  recipient: "parent",
  situation: "Student is doing great.",
  tone: "positive",
};

describe("POST /api/communications — tone length guard", () => {
  it("returns 401 when unauthenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it("returns 413 when tone exceeds 50 chars", async () => {
    authedSession();
    const res = await POST(makeRequest({ ...VALID_BODY, tone: "a".repeat(51) }));
    expect(res.status).toBe(413);
    expect(await res.text()).toMatch(/tone too long/);
  });

  it("returns 200 when tone is exactly 50 chars", async () => {
    authedSession();
    const res = await POST(makeRequest({ ...VALID_BODY, tone: "a".repeat(50) }));
    expect(res.status).toBe(200);
  });

  it("returns 200 for a normal tone value", async () => {
    authedSession();
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
  });
});
