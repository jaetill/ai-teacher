import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────
const { mockDbSelect, mockDbInsert } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { stream: vi.fn() };
  },
}));

vi.mock("@/db", () => ({ db: { select: mockDbSelect, insert: mockDbInsert } }));
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
import { POST } from "../../src/app/api/copilot/route";

const mockGetServerSession = vi.mocked(getServerSession);

// Drizzle chain that resolves `value` when awaited at any depth.
function makeChain(value: unknown) {
  const p = Promise.resolve(value);
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.from = self;
  chain.where = self;
  chain.orderBy = self;
  chain.values = self;
  chain.returning = self;
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

const SESSION = { user: { email: "teacher@school.edu", name: "Teacher" } };
const MESSAGES = [{ role: "user", content: "Help me write a rubric" }];

describe("POST /api/copilot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no session", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await POST(makeRequest({ messages: MESSAGES }));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 400 when messages is empty", async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);

    const res = await POST(makeRequest({ messages: [] }));

    expect(res.status).toBe(400);
  });

  describe("IDOR guard — conversationId ownership check", () => {
    it("returns 403 when conversationId belongs to a different user", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION);
      mockDbSelect.mockReturnValueOnce(makeChain([{ ownerEmail: "attacker@evil.com" }]));

      const res = await POST(makeRequest({ messages: MESSAGES, conversationId: "conv-uuid-123" }));

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    });

    it("returns 403 when conversationId does not exist", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION);
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await POST(
        makeRequest({ messages: MESSAGES, conversationId: "nonexistent-uuid" }),
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    });

    // Null bypass (issue #269): both ownerEmail and session email are null →
    // null !== null is false, so a naive check would grant access.
    it("returns 403 when ownerEmail is null (pre-migration row) and session email is also null", async () => {
      mockGetServerSession.mockResolvedValueOnce({
        user: { email: null, name: "Unknown" },
      });
      mockDbSelect.mockReturnValueOnce(makeChain([{ ownerEmail: null }]));

      const res = await POST(makeRequest({ messages: MESSAGES, conversationId: "conv-uuid-old" }));

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    });

    it("returns 403 when ownerEmail is null (pre-migration row) and session has a real email", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION);
      mockDbSelect.mockReturnValueOnce(makeChain([{ ownerEmail: null }]));

      const res = await POST(makeRequest({ messages: MESSAGES, conversationId: "conv-uuid-old" }));

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    });

    it("returns 403 when session email is null even if conversation has an owner", async () => {
      mockGetServerSession.mockResolvedValueOnce({
        user: { email: null, name: "Unknown" },
      });
      mockDbSelect.mockReturnValueOnce(makeChain([{ ownerEmail: "teacher@school.edu" }]));

      const res = await POST(makeRequest({ messages: MESSAGES, conversationId: "conv-uuid-123" }));

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    });
  });
});
