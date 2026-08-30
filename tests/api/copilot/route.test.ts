import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────
const { mockDbSelect, mockDbInsert, mockDbUpdate, mockStreamFn } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockStreamFn: vi.fn().mockReturnValue({ [Symbol.asyncIterator]: async function* () {} }),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limit", () => ({
  checkAiRateLimit: vi.fn().mockResolvedValue(null),
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { stream: mockStreamFn };
  },
}));
vi.mock("@/db", () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
  },
}));
vi.mock("@/db/schema", () => ({
  copilotConversations: {},
  copilotMessages: {},
  errorEvents: {},
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

// ── Chain helper (same pattern as write-idor.test.ts) ────────────────────────
function makeChain(value: unknown) {
  const p = Promise.resolve(value);
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.from = self;
  chain.where = self;
  chain.orderBy = self;
  chain.limit = self;
  chain.values = self;
  chain.onConflictDoNothing = self;
  chain.returning = self;
  chain.set = self;
  chain.then = (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => p.then(r, j);
  chain.catch = (j: (e: unknown) => unknown) => p.catch(j);
  chain.finally = (fn: () => void) => p.finally(fn);
  return chain;
}

function makeRequest(body: object) {
  return new Request("http://localhost/api/copilot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function authedSession(email = "teacher@example.com") {
  mockSession.mockResolvedValueOnce({
    user: { email },
    expires: "",
  });
}

// ── UUID validation tests ────────────────────────────────────────────────────
describe("POST /api/copilot — conversationId UUID validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: all DB ops succeed with empty results
    mockDbSelect.mockReturnValue(makeChain([]));
    mockDbInsert.mockReturnValue(makeChain([{ id: VALID_UUID }]));
    mockDbUpdate.mockReturnValue(makeChain(undefined));
  });

  it("returns 401 when there is no session", async () => {
    mockSession.mockResolvedValueOnce(null);

    const res = await POST(makeRequest({ messages: VALID_MESSAGES }));

    expect(res.status).toBe(401);
    expect(mockStreamFn).not.toHaveBeenCalled();
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
      makeRequest({
        messages: VALID_MESSAGES,
        conversationId: "../../../etc/passwd",
      }),
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

    // Should not be a 400 from UUID validation (may be another status from mocks, but not 400)
    expect(res.status).not.toBe(400);
  });

  it("proceeds past validation when conversationId is omitted", async () => {
    authedSession();

    const res = await POST(makeRequest({ messages: VALID_MESSAGES }));

    expect(res.status).not.toBe(400);
  });
});

// ── Quota-guard / input-size limits ─────────────────────────────────────────
describe("POST /api/copilot — input-size guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbSelect.mockReturnValue(makeChain([]));
    mockDbInsert.mockReturnValue(makeChain([{ id: VALID_UUID }]));
    mockDbUpdate.mockReturnValue(makeChain(undefined));
  });

  it("returns 413 when context exceeds 8000 chars", async () => {
    authedSession();

    const res = await POST(makeRequest({ messages: VALID_MESSAGES, context: "x".repeat(8001) }));

    expect(res.status).toBe(413);
  });

  it("returns 413 when messages array exceeds 50 entries", async () => {
    authedSession();

    const tooMany = Array.from({ length: 51 }, () => ({
      role: "user",
      content: "hi",
    }));
    const res = await POST(makeRequest({ messages: tooMany }));

    expect(res.status).toBe(413);
  });

  it("returns 413 when a single USER message content exceeds 10000 chars", async () => {
    authedSession();

    const res = await POST(
      makeRequest({
        messages: [{ role: "user", content: "y".repeat(10001) }],
      }),
    );

    expect(res.status).toBe(413);
  });

  // Regression: the per-message cap used to apply to every role, so the first
  // long copilot answer (this route authorises 64k output tokens) made every
  // subsequent turn 413 and bricked the conversation.
  it("does not reject a long ASSISTANT turn in the history", async () => {
    authedSession();

    const res = await POST(
      makeRequest({
        messages: [
          { role: "user", content: "Map Q1." },
          { role: "assistant", content: "z".repeat(120_000) },
          { role: "user", content: "Each lesson should be its own row." },
        ],
      }),
    );

    expect(res.status).not.toBe(413);
  });

  it("returns 413 when the whole transcript exceeds 400000 chars", async () => {
    authedSession();

    const res = await POST(
      makeRequest({
        messages: [
          { role: "user", content: "Map Q1." },
          { role: "assistant", content: "z".repeat(200_000) },
          { role: "assistant", content: "z".repeat(200_001) },
          { role: "user", content: "Again please." },
        ],
      }),
    );

    expect(res.status).toBe(413);
    expect(await res.text()).toContain("new conversation");
  });

  it("does not reject context at exactly 8000 chars", async () => {
    authedSession();

    const res = await POST(makeRequest({ messages: VALID_MESSAGES, context: "x".repeat(8000) }));

    expect(res.status).not.toBe(413);
  });

  it("does not reject messages at exactly 50 entries", async () => {
    authedSession();

    const atLimit = Array.from({ length: 50 }, () => ({
      role: "user",
      content: "hi",
    }));
    const res = await POST(makeRequest({ messages: atLimit }));

    expect(res.status).not.toBe(413);
  });
});

// ── Cross-tenant curriculum context isolation ────────────────────────────────
describe("POST /api/copilot — curriculum context owner isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbInsert.mockReturnValue(makeChain([{ id: VALID_UUID }]));
    mockDbUpdate.mockReturnValue(makeChain(undefined));
  });

  it("system prompt contains only the requesting teacher's courses, not another teacher's", async () => {
    authedSession("teacher-a@school.com");

    // courses query (owner-filtered) → teacher A's course only
    mockDbSelect.mockReturnValueOnce(
      makeChain([
        {
          id: "course-a-uuid",
          title: "Grade 6 ELA",
          grade: 6,
          teacherNotes: null,
        },
      ]),
    );
    // units query for teacher A's courseId → empty (no units seeded)
    mockDbSelect.mockReturnValue(makeChain([]));

    await POST(makeRequest({ messages: VALID_MESSAGES }));

    expect(mockStreamFn).toHaveBeenCalledOnce();
    const { system } = mockStreamFn.mock.calls[0][0] as { system: string };

    // Teacher A's course is in the AI context
    expect(system).toContain("Grade 6 ELA");

    // Teacher B's hypothetical course is absent — the owner filter prevented it
    expect(system).not.toContain("teacher-b");
    expect(system).not.toContain("Grade 8 History");
  });

  it("owner email is passed to the courses where clause", async () => {
    authedSession("teacher-a@school.com");

    mockDbSelect.mockReturnValue(makeChain([]));

    await POST(makeRequest({ messages: VALID_MESSAGES }));

    const { eq } = await import("drizzle-orm");
    // eq(courses.ownerEmail, email) — courses.ownerEmail is undefined in the stub schema,
    // but the second arg must be the session user's email, proving the filter is applied.
    expect(vi.mocked(eq)).toHaveBeenCalledWith(undefined, "teacher-a@school.com");
  });
});

// ── Input size cap tests (regression guard for #356 / #373) ─────────────────
describe("POST /api/copilot — input size caps (quota-exhaustion prevention)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbSelect.mockReturnValue(makeChain([]));
    mockDbInsert.mockReturnValue(makeChain([{ id: VALID_UUID }]));
    mockDbUpdate.mockReturnValue(makeChain(undefined));
  });

  it("returns 413 when context exceeds MAX_CONTEXT_CHARS (8 000)", async () => {
    authedSession();

    const res = await POST(makeRequest({ messages: VALID_MESSAGES, context: "x".repeat(8_001) }));

    expect(res.status).toBe(413);
    // These bodies are read verbatim by the copilot panel, so they assert the
    // teacher-facing wording rather than the old developer strings ("context
    // too large"). The stable machine code lives in error_events.reason and is
    // pinned separately, below.
    expect(await res.text()).toMatch(/too much on this page/i);
  });

  it("returns 413 when messages array exceeds MAX_MESSAGES (50)", async () => {
    authedSession();

    const tooManyMessages = Array.from({ length: 51 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: "msg",
    }));

    const res = await POST(makeRequest({ messages: tooManyMessages }));

    expect(res.status).toBe(413);
    // No /s flag — tsconfig targets ES2017, where dotAll is not available.
    expect(await res.text()).toMatch(/too many turns[\s\S]*start a new conversation/i);
  });

  it("returns 413 when a single message content exceeds MAX_MESSAGE_CONTENT_CHARS (10 000)", async () => {
    authedSession();

    const res = await POST(
      makeRequest({ messages: [{ role: "user", content: "y".repeat(10_001) }] }),
    );

    expect(res.status).toBe(413);
    const body = await res.text();
    expect(body).toMatch(/too long to send/i);
    // Say what to do about it, not just that it failed.
    expect(body).toMatch(/attach it as a file|send it in pieces/i);
    // And don't quote her own count back at her — see the route comment.
    expect(body).not.toMatch(/about 10,000 characters; the limit is 10,000/);
  });

  it("proceeds normally when all inputs are within limits", async () => {
    authedSession();

    const res = await POST(
      makeRequest({
        messages: [{ role: "user", content: "Hello" }],
        context: "short context",
      }),
    );

    expect(res.status).not.toBe(413);
  });
});

// ── Request parsing / AI budget ──────────────────────────────────────────────
describe("POST /api/copilot — body parsing and rate limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbSelect.mockReturnValue(makeChain([]));
    mockDbInsert.mockReturnValue(makeChain([{ id: VALID_UUID }]));
    mockDbUpdate.mockReturnValue(makeChain(undefined));
  });

  it("returns 400 on a malformed JSON body", async () => {
    authedSession();

    const res = await POST(
      new Request("http://localhost/api/copilot", { method: "POST", body: "{not json" }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid JSON body");
    expect(mockStreamFn).not.toHaveBeenCalled();
  });

  it("returns the 429 from checkAiRateLimit when the user is over budget", async () => {
    authedSession();

    const { checkAiRateLimit } = await import("@/lib/rate-limit");
    vi.mocked(checkAiRateLimit).mockResolvedValueOnce(
      Response.json({ error: "rate_limited", retry_after_seconds: 60 }, { status: 429 }),
    );

    const res = await POST(makeRequest({ messages: VALID_MESSAGES }));

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("rate_limited");
    expect(mockStreamFn).not.toHaveBeenCalled();
    expect(mockDbInsert).not.toHaveBeenCalled();
  });
});

// ── Assistant-message persistence semantics ──────────────────────────────────
describe("POST /api/copilot — assistant persistence after the stream", () => {
  function textDelta(text: string) {
    return { type: "content_block_delta", delta: { type: "text_delta", text } };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockDbSelect.mockReturnValue(makeChain([]));
    mockDbInsert.mockReturnValue(makeChain([{ id: VALID_UUID }]));
    mockDbUpdate.mockReturnValue(makeChain(undefined));
  });

  it("persists the assistant message and bumps the conversation after a successful stream", async () => {
    authedSession();

    mockStreamFn.mockReturnValueOnce({
      [Symbol.asyncIterator]: async function* () {
        yield textDelta("Hello ");
        yield textDelta("teacher");
      },
    });

    const res = await POST(makeRequest({ messages: VALID_MESSAGES }));

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("Hello teacher");
    // inserts: new conversation, user message, assistant message
    expect(mockDbInsert).toHaveBeenCalledTimes(3);
    // conversation messageCount/updatedAt bump
    expect(mockDbUpdate).toHaveBeenCalledTimes(1);
  });

  it("skips the assistant insert and conversation update when the stream yields no text", async () => {
    authedSession();

    mockStreamFn.mockReturnValueOnce({
      [Symbol.asyncIterator]: async function* () {
        // no text_delta events at all
      },
    });

    const res = await POST(makeRequest({ messages: VALID_MESSAGES }));

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
    // inserts: new conversation + user message only — no empty assistant row
    expect(mockDbInsert).toHaveBeenCalledTimes(2);
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("persists accumulated text and errors the response stream on a mid-stream failure", async () => {
    authedSession();

    const streamError = new Error("anthropic exploded");
    mockStreamFn.mockReturnValueOnce({
      [Symbol.asyncIterator]: async function* () {
        yield textDelta("partial answer");
        throw streamError;
      },
    });

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(makeRequest({ messages: VALID_MESSAGES }));

    expect(res.status).toBe(200);
    // the response stream surfaces the error to the client
    await expect(res.text()).rejects.toBe(streamError);
    // the partial assistant text is still persisted, and the failure is now
    // recorded too: conversation + user + error_events + assistant
    expect(mockDbInsert).toHaveBeenCalledTimes(4);
    expect(mockDbUpdate).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith("[copilot] Anthropic stream failed:", streamError);

    consoleErrorSpy.mockRestore();
  });
});

// ── Refusals are recorded, and say which guard fired ─────────────────────────
// Six guards on this route return 413. On 2026-08-30 one of them fired for a
// real user and there was no way afterwards to tell which, because Vercel logs
// the status code and not the body. These tests pin the distinguishing bit.
describe("POST /api/copilot — refusals are logged with a distinct reason", () => {
  /** Records every row handed to db.insert(...).values(...). */
  function recordingInserts() {
    const rows: Record<string, unknown>[] = [];
    mockDbInsert.mockImplementation(() => {
      const chain = makeChain([{ id: VALID_UUID }]) as Record<string, unknown>;
      chain.values = (v: Record<string, unknown>) => {
        rows.push(v);
        return chain;
      };
      return chain;
    });
    return rows;
  }

  const reasonOf = (rows: Record<string, unknown>[]) =>
    rows.find((r) => typeof r.reason === "string")?.reason;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDbSelect.mockReturnValue(makeChain([]));
    mockDbUpdate.mockReturnValue(makeChain(undefined));
  });

  it("records unauthorized when there is no session", async () => {
    const rows = recordingInserts();
    mockSession.mockResolvedValueOnce(null);

    const res = await POST(makeRequest({ messages: VALID_MESSAGES }));

    expect(res.status).toBe(401);
    expect(reasonOf(rows)).toBe("unauthorized");
  });

  it("records bad_conversation_id for a malformed id", async () => {
    const rows = recordingInserts();
    authedSession();

    const res = await POST(makeRequest({ messages: VALID_MESSAGES, conversationId: "nope" }));

    expect(res.status).toBe(400);
    expect(reasonOf(rows)).toBe("bad_conversation_id");
  });

  it("records user_message_too_long, and tells her what to do instead", async () => {
    const rows = recordingInserts();
    authedSession();

    const res = await POST(
      makeRequest({ messages: [{ role: "user", content: "x".repeat(10_001) }] }),
    );

    expect(res.status).toBe(413);
    expect(reasonOf(rows)).toBe("user_message_too_long");
    // The body is what reaches the panel — it has to be actionable, not "413".
    expect(await res.text()).toMatch(/attach it as a file|send it in pieces/i);
  });

  it("records too_many_messages", async () => {
    const rows = recordingInserts();
    authedSession();

    const res = await POST(
      makeRequest({
        messages: Array.from({ length: 51 }, () => ({ role: "user", content: "hi" })),
      }),
    );

    expect(res.status).toBe(413);
    expect(reasonOf(rows)).toBe("too_many_messages");
  });

  it("records too_many_attachments", async () => {
    const rows = recordingInserts();
    authedSession();

    const res = await POST(
      makeRequest({
        messages: VALID_MESSAGES,
        attachments: Array.from({ length: 6 }, (_, i) => ({
          name: `f${i}.txt`,
          mediaType: "text/plain",
          kind: "text",
          data: "hello",
          size: 5,
        })),
      }),
    );

    expect(res.status).toBe(413);
    expect(reasonOf(rows)).toBe("too_many_attachments");
  });

  it("carries the measurements that identify the guard", async () => {
    const rows = recordingInserts();
    authedSession();

    await POST(makeRequest({ messages: [{ role: "user", content: "x".repeat(10_001) }] }));

    const logged = rows.find((r) => typeof r.reason === "string");
    expect(logged?.detail).toMatchObject({
      messageCount: 1,
      longestUserMessageChars: 10_001,
      limit: 10_000,
    });
  });

  it("still refuses when the error log itself cannot be written", async () => {
    mockDbInsert.mockImplementation(() => ({
      values: () => Promise.reject(new Error("neon unreachable")),
    }));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    authedSession();

    const res = await POST(makeRequest({ messages: VALID_MESSAGES, conversationId: "nope" }));

    expect(res.status).toBe(400);
    spy.mockRestore();
  });
});
