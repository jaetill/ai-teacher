import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@anthropic-ai/sdk", () => {
  const mockStream = {
    [Symbol.asyncIterator]: async function* () {},
  };
  return {
    default: class {
      messages = {
        stream: vi.fn().mockReturnValue(mockStream),
      };
    },
  };
});
vi.mock("@/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue([]),
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "550e8400-e29b-41d4-a716-446655440000" }]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  },
}));
vi.mock("@/db/schema", () => ({
  copilotConversations: {},
  copilotMessages: {},
  courses: {},
  units: {},
  lessons: {},
  unitStandards: {},
  lessonStandards: {},
  standards: {},
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  sql: vi.fn(),
  asc: vi.fn(),
  inArray: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { POST } from "../../../src/app/api/copilot/route";

const mockSession = vi.mocked(getServerSession);

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const VALID_MESSAGES = [{ role: "user", content: "Hello" }];

function makeRequest(body: object) {
  return new Request("http://localhost/api/copilot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function authedSession() {
  mockSession.mockResolvedValueOnce({
    user: { email: "teacher@example.com" },
    expires: "",
  });
}

describe("POST /api/copilot — conversationId UUID validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no session", async () => {
    mockSession.mockResolvedValueOnce(null);

    const res = await POST(makeRequest({ messages: VALID_MESSAGES }));

    expect(res.status).toBe(401);
  });

  it("returns 400 when conversationId is not a valid UUID", async () => {
    authedSession();

    const res = await POST(makeRequest({ messages: VALID_MESSAGES, conversationId: "not-a-uuid" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Bad Request");
  });

  it("returns 400 for a path-traversal-style conversationId", async () => {
    authedSession();

    const res = await POST(
      makeRequest({ messages: VALID_MESSAGES, conversationId: "../../../etc/passwd" }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Bad Request");
  });

  it("returns 400 for an SQL-injection-style conversationId", async () => {
    authedSession();

    const res = await POST(
      makeRequest({
        messages: VALID_MESSAGES,
        conversationId: "'; DROP TABLE copilot_conversations; --",
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Bad Request");
  });

  it("returns 400 for a UUID-like string with wrong segment length", async () => {
    authedSession();

    const res = await POST(
      makeRequest({
        messages: VALID_MESSAGES,
        conversationId: "550e8400-e29b-41d4-a716-44665544000",
      }),
    );

    expect(res.status).toBe(400);
  });

  it("proceeds past validation when conversationId is a valid UUID", async () => {
    authedSession();

    const res = await POST(makeRequest({ messages: VALID_MESSAGES, conversationId: VALID_UUID }));

    // Should not be a 400 from UUID validation (may be another error from mocks, but not 400)
    expect(res.status).not.toBe(400);
  });

  it("proceeds past validation when conversationId is omitted", async () => {
    authedSession();

    const res = await POST(makeRequest({ messages: VALID_MESSAGES }));

    expect(res.status).not.toBe(400);
  });
});
