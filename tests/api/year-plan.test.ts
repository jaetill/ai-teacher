import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────
const { mockStreamFn } = vi.hoisted(() => ({
  mockStreamFn: vi.fn().mockReturnValue({
    [Symbol.asyncIterator]: async function* () {},
  }),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { stream: mockStreamFn };
  },
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

import { getServerSession } from "next-auth";
import { POST } from "../../src/app/api/year-plan/route";

const mockSession = vi.mocked(getServerSession);

function authedSession() {
  mockSession.mockResolvedValueOnce({ user: { email: "teacher@example.com" }, expires: "" });
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/year-plan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = { grade: 7, schoolYear: "2025-2026", standards: "7.RL.1" };

describe("POST /api/year-plan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStreamFn.mockReturnValue({ [Symbol.asyncIterator]: async function* () {} });
  });

  it("returns 401 when called without a session", async () => {
    mockSession.mockResolvedValue(null);

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 400 when required fields are missing", async () => {
    authedSession();
    const res = await POST(makeRequest({ grade: 7 }));
    expect(res.status).toBe(400);
  });

  it("returns 200 text/plain stream for a valid authed request", async () => {
    authedSession();
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/plain/);
    expect(mockStreamFn).toHaveBeenCalledOnce();
  });
});

describe("POST /api/year-plan — grade validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStreamFn.mockReturnValue({ [Symbol.asyncIterator]: async function* () {} });
    authedSession();
  });

  it("returns 400 for grade 5 (below range)", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, grade: 5 }));
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/grade must be 6, 7, or 8/i);
  });

  it("returns 400 for grade 9 (above range)", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, grade: 9 }));
    expect(res.status).toBe(400);
  });

  it("returns 200 for each valid grade (6, 7, 8)", async () => {
    for (const grade of [6, 7, 8]) {
      authedSession();
      const res = await POST(makeRequest({ ...VALID_BODY, grade }));
      expect(res.status).toBe(200);
    }
  });
});

describe("POST /api/year-plan — size guards (413)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStreamFn.mockReturnValue({ [Symbol.asyncIterator]: async function* () {} });
    authedSession();
  });

  it("returns 413 when standards exceeds 10 000 chars", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, standards: "s".repeat(10_001) }));
    expect(res.status).toBe(413);
    expect(await res.text()).toMatch(/too large/i);
  });

  it("returns 413 when existingCurriculum exceeds 20 000 chars", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, existingCurriculum: "c".repeat(20_001) }));
    expect(res.status).toBe(413);
  });

  it("returns 413 when notes exceeds 5 000 chars", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, notes: "n".repeat(5_001) }));
    expect(res.status).toBe(413);
  });

  it("returns 413 when schoolYear exceeds 50 chars", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, schoolYear: "y".repeat(51) }));
    expect(res.status).toBe(413);
  });

  it("passes when all fields are exactly at the limit", async () => {
    const res = await POST(
      makeRequest({
        ...VALID_BODY,
        standards: "s".repeat(10_000),
        existingCurriculum: "c".repeat(20_000),
        notes: "n".repeat(5_000),
      }),
    );
    expect(res.status).toBe(200);
  });
});
