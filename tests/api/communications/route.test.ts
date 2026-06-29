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

describe("Anthropic SDK streaming contract — content_block_delta / text_delta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.mockResolvedValue({ user: { email: "teacher@example.com" }, expires: "" });
  });

  it("emits text carried by content_block_delta + text_delta events", async () => {
    async function* stream() {
      yield {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "Dear Parent," },
      };
    }
    mockStreamFn.mockReturnValue(stream());
    const res = await POST(makeRequest(VALID_BODY));
    expect(await res.text()).toBe("Dear Parent,");
  });

  it("concatenates multiple text_delta chunks in order", async () => {
    async function* stream() {
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
    mockStreamFn.mockReturnValue(stream());
    const res = await POST(makeRequest(VALID_BODY));
    expect(await res.text()).toBe("Chunk1 Chunk2");
  });

  it("silently skips non-text events (message_start, input_json_delta, message_stop)", async () => {
    async function* stream() {
      yield { type: "message_start", message: { id: "msg_1" } };
      yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "A" } };
      yield {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: "{" },
      };
      yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "B" } };
      yield { type: "message_stop" };
    }
    mockStreamFn.mockReturnValue(stream());
    const res = await POST(makeRequest(VALID_BODY));
    expect(await res.text()).toBe("AB");
  });

  it("returns empty body and 200 when stream yields no text_delta events", async () => {
    async function* stream() {
      yield { type: "message_start", message: { id: "msg_2" } };
      yield { type: "message_stop" };
    }
    mockStreamFn.mockReturnValue(stream());
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
  });
});

describe("POST /api/communications — tone length guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
    expect(mockStreamFn).not.toHaveBeenCalled();
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
