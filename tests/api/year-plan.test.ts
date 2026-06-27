import { describe, it, expect, vi, beforeEach } from "vitest";

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

const mockedGetServerSession = vi.mocked(getServerSession);

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/year-plan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function authedSession() {
  mockedGetServerSession.mockResolvedValueOnce({
    user: { email: "teacher@example.com" },
    expires: "",
  });
}

const VALID_BODY = { grade: 7, schoolYear: "2025-2026", standards: "7.RL.1" };

describe("POST /api/year-plan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when called without a session", async () => {
    mockedGetServerSession.mockResolvedValue(null);

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });
});

describe("POST /api/year-plan — grade validation (400)", () => {
  it("rejects grade 5 with 400", async () => {
    authedSession();
    const res = await POST(makeRequest({ ...VALID_BODY, grade: 5 }));
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/grade must be 6, 7, or 8/i);
  });

  it("rejects grade 9 with 400", async () => {
    authedSession();
    const res = await POST(makeRequest({ ...VALID_BODY, grade: 9 }));
    expect(res.status).toBe(400);
  });

  it("accepts grade 6", async () => {
    authedSession();
    const res = await POST(makeRequest({ ...VALID_BODY, grade: 6 }));
    expect(res.status).toBe(200);
  });

  it("accepts grade 8", async () => {
    authedSession();
    const res = await POST(makeRequest({ ...VALID_BODY, grade: 8 }));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/year-plan — input size guards (413)", () => {
  it("returns 413 when standards exceeds 5 000 chars", async () => {
    authedSession();
    const res = await POST(makeRequest({ ...VALID_BODY, standards: "s".repeat(5_001) }));
    expect(res.status).toBe(413);
    expect(await res.text()).toMatch(/maximum allowed length/i);
  });

  it("passes when standards equals exactly 5 000 chars", async () => {
    authedSession();
    const res = await POST(makeRequest({ ...VALID_BODY, standards: "s".repeat(5_000) }));
    expect(res.status).toBe(200);
  });

  it("returns 413 when existingCurriculum exceeds 20 000 chars", async () => {
    authedSession();
    const res = await POST(makeRequest({ ...VALID_BODY, existingCurriculum: "c".repeat(20_001) }));
    expect(res.status).toBe(413);
  });

  it("returns 413 when notes exceeds 5 000 chars", async () => {
    authedSession();
    const res = await POST(makeRequest({ ...VALID_BODY, notes: "n".repeat(5_001) }));
    expect(res.status).toBe(413);
  });

  it("passes when optional fields are within limits", async () => {
    authedSession();
    const res = await POST(
      makeRequest({
        ...VALID_BODY,
        existingCurriculum: "c".repeat(20_000),
        notes: "n".repeat(5_000),
      }),
    );
    expect(res.status).toBe(200);
  });
});
