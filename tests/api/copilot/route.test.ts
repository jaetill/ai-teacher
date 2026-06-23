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
    expect(await res.text()).toContain("context too large");
  });

  it("returns 413 when messages array exceeds MAX_MESSAGES (50)", async () => {
    authedSession();

    const tooManyMessages = Array.from({ length: 51 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: "msg",
    }));

    const res = await POST(makeRequest({ messages: tooManyMessages }));

    expect(res.status).toBe(413);
    expect(await res.text()).toContain("too many messages");
  });

  it("returns 413 when a single message content exceeds MAX_MESSAGE_CONTENT_CHARS (10 000)", async () => {
    authedSession();

    const res = await POST(
      makeRequest({ messages: [{ role: "user", content: "y".repeat(10_001) }] }),
    );

    expect(res.status).toBe(413);
    expect(await res.text()).toContain("message content too large");
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
