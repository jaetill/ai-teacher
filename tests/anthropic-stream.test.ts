import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────
// mockStream is shared across all Anthropic instances so each test can
// control what the stream yields without losing the reference.
const { mockStream, mockDbSelect, mockDbInsert, mockDbUpdate } = vi.hoisted(() => ({
  mockStream: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { stream: mockStream };
  },
}));

vi.mock("@/db", () => ({
  db: { select: mockDbSelect, insert: mockDbInsert, update: mockDbUpdate },
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

// ── Imports after mocks ──────────────────────────────────────────────────
import { getServerSession } from "next-auth";
import { POST } from "../src/app/api/copilot/route";

const mockGetServerSession = vi.mocked(getServerSession);

const SESSION = { user: { email: "teacher@school.edu", name: "Teacher" } };

// Drizzle chain: supports the full method surface the copilot route calls,
// including .set() needed for the post-stream db.update(conversations) call.
function makeChain(value: unknown) {
  const p = Promise.resolve(value);
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.from = self;
  chain.where = self;
  chain.orderBy = self;
  chain.values = self;
  chain.returning = self;
  chain.set = self;
  chain.then = (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => p.then(r, j);
  chain.catch = (j: (e: unknown) => unknown) => p.catch(j);
  chain.finally = (fn: () => void) => p.finally(fn);
  return chain;
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/copilot", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetServerSession.mockResolvedValue(SESSION as never);
  // First insert: create new conversation, return id
  mockDbInsert.mockReturnValueOnce(makeChain([{ id: "conv-stream-test" }]));
  // Subsequent inserts: user message + assistant message saves
  mockDbInsert.mockReturnValue(makeChain([]));
  // buildCurriculumContext: no courses → returns early, no further selects
  mockDbSelect.mockReturnValue(makeChain([]));
  // Post-stream conversation metadata update
  mockDbUpdate.mockReturnValue(makeChain([]));
});

// ── Streaming event shapes ───────────────────────────────────────────────
// All 9 API routes gate on exactly these two checks to extract streamed text.
// If the SDK renames either field, every route silently emits empty responses.

describe("Anthropic SDK streaming contract — content_block_delta / text_delta", () => {
  it("route emits text carried by content_block_delta + text_delta events", async () => {
    async function* singleTextDelta() {
      yield {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "Hello, teacher!" },
      };
    }
    mockStream.mockReturnValue(singleTextDelta());

    const res = await POST(makeRequest({ messages: [{ role: "user", content: "Hi" }] }));
    expect(res.status).toBe(200);

    const body = await res.text();
    expect(body).toBe("Hello, teacher!");
  });

  it("route concatenates multiple text_delta chunks in order", async () => {
    async function* multiChunk() {
      yield {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "Chunk1 " },
      };
      yield {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "Chunk2" },
      };
    }
    mockStream.mockReturnValue(multiChunk());

    const res = await POST(makeRequest({ messages: [{ role: "user", content: "Hi" }] }));
    const body = await res.text();
    expect(body).toBe("Chunk1 Chunk2");
  });

  it("route silently skips non-text events (message_start, content_block_start, message_stop)", async () => {
    async function* mixedEvents() {
      yield { type: "message_start", message: { id: "msg_1" } };
      yield { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } };
      yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "A" } };
      // input_json_delta carries tool call fragments — not forwarded to the UI
      yield {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: "{" },
      };
      yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "B" } };
      yield { type: "message_stop" };
    }
    mockStream.mockReturnValue(mixedEvents());

    const res = await POST(makeRequest({ messages: [{ role: "user", content: "Hi" }] }));
    const body = await res.text();
    expect(body).toBe("AB");
  });

  it("route returns an empty body when the stream yields no text_delta events", async () => {
    async function* noText() {
      yield { type: "message_start", message: { id: "msg_2" } };
      yield { type: "message_stop" };
    }
    mockStream.mockReturnValue(noText());

    const res = await POST(makeRequest({ messages: [{ role: "user", content: "Hi" }] }));
    const body = await res.text();
    expect(body).toBe("");
  });
});
