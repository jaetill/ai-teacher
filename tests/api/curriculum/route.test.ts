import { describe, it, expect, vi, beforeEach } from "vitest";

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
import { POST } from "../../../src/app/api/curriculum/route";

const mockSession = vi.mocked(getServerSession);

function makeRequest(body: object) {
  return new Request("http://localhost/api/curriculum", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  grade: 7,
  theme: "ecosystems",
  weeks: 4,
  standards: "7.RI.1",
};

describe("POST /api/curriculum", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStreamFn.mockReturnValue({ [Symbol.asyncIterator]: async function* () {} });
  });

  it("returns 401 when called without a session", async () => {
    mockSession.mockResolvedValueOnce(null);

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 400 when required fields are missing", async () => {
    mockSession.mockResolvedValueOnce({ user: { email: "teacher@example.com" }, expires: "" });

    const res = await POST(makeRequest({ grade: 7 }));

    expect(res.status).toBe(400);
  });

  it("returns 200 text/plain stream for a valid authed request", async () => {
    mockSession.mockResolvedValueOnce({ user: { email: "teacher@example.com" }, expires: "" });

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/plain/);
    expect(mockStreamFn).toHaveBeenCalledOnce();
    expect(mockStreamFn).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-opus-4-8" }),
    );
  });
});
