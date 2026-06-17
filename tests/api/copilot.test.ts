import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────
const { mockDbSelect, mockDbInsert, mockDbUpdate } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

// Returns an empty async iterator so the for-await loop in the route completes
// without emitting events; the stream never throws, keeping background work clean.
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      stream: () => ({
        [Symbol.asyncIterator]: async function* () {},
      }),
    };
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
import { copilotConversations } from "@/db/schema";
import { POST } from "../../src/app/api/copilot/route";

const mockGetServerSession = vi.mocked(getServerSession);

// Drizzle chain that resolves `value` when awaited at any depth.
// `.values` is a trackable vi.fn() spy so tests can assert DB write args.
function makeChain(value: unknown) {
  const p = Promise.resolve(value);
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.from = self;
  chain.where = self;
  chain.orderBy = self;
  chain.values = vi.fn(self); // spy: records args AND returns chain
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

const SESSION = { user: { email: "teacher@school.edu", name: "Teacher" } };
const MESSAGES = [{ role: "user", content: "Help me write a rubric" }];

describe("POST /api/copilot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Safe defaults so background async work (assistant insert, conversation update)
    // never throws when these mocks are not explicitly overridden in a test.
    mockDbInsert.mockReturnValue(makeChain([]));
    mockDbSelect.mockReturnValue(makeChain([]));
    mockDbUpdate.mockReturnValue(makeChain([]));
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
      // Ownership query returns a row owned by a different email.
      mockDbSelect.mockReturnValueOnce(makeChain([{ ownerEmail: "attacker@evil.com" }]));

      const res = await POST(makeRequest({ messages: MESSAGES, conversationId: "conv-uuid-123" }));

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    });

    it("returns 403 when conversationId does not exist", async () => {
      mockGetServerSession.mockResolvedValueOnce(SESSION);
      // Ownership query returns no rows.
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const res = await POST(
        makeRequest({ messages: MESSAGES, conversationId: "nonexistent-uuid" }),
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    });
  });

  it("stores ownerEmail from session on new conversation creation", async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    const convInsertChain = makeChain([{ id: "new-conv-id" }]);
    // First insert call is the copilotConversations row; subsequent calls use the default stub.
    mockDbInsert.mockReturnValueOnce(convInsertChain);

    await POST(makeRequest({ messages: MESSAGES }));

    expect(mockDbInsert).toHaveBeenCalledWith(copilotConversations);
    const valuesArg = (convInsertChain.values as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(valuesArg?.ownerEmail).toBe(SESSION.user.email);
  });
});
