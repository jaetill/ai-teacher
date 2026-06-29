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
        delta: { type: "text_delta", text: "## Unit Title" },
      };
    }
    mockStreamFn.mockReturnValue(stream());
    const res = await POST(makeRequest(VALID_BODY));
    expect(await res.text()).toBe("## Unit Title");
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
    expect(mockStreamFn).not.toHaveBeenCalled();
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

describe("POST /api/curriculum — size guards (413)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStreamFn.mockReturnValue({ [Symbol.asyncIterator]: async function* () {} });
    mockSession.mockResolvedValueOnce({ user: { email: "teacher@example.com" }, expires: "" });
  });

  it("returns 413 when standards exceeds 10 000 chars", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, standards: "s".repeat(10_001) }));
    expect(res.status).toBe(413);
    expect(await res.text()).toMatch(/too large/i);
  });

  it("returns 413 when theme exceeds 1 000 chars", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, theme: "t".repeat(1_001) }));
    expect(res.status).toBe(413);
  });

  it("returns 413 when optional context exceeds 5 000 chars", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, context: "c".repeat(5_001) }));
    expect(res.status).toBe(413);
  });

  it("passes when all fields are exactly at the limit", async () => {
    const res = await POST(
      makeRequest({
        ...VALID_BODY,
        theme: "t".repeat(1_000),
        standards: "s".repeat(10_000),
        context: "c".repeat(5_000),
      }),
    );
    expect(res.status).toBe(200);
  });
});
