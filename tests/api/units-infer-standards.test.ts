import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockMessagesCreate, mockGetServerSession } = vi.hoisted(() => ({
  mockMessagesCreate: vi.fn(),
  mockGetServerSession: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => {
  function Anthropic() {
    return { messages: { create: mockMessagesCreate } };
  }
  return { default: Anthropic };
});

vi.mock("next-auth", () => ({ getServerSession: mockGetServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/db", () => ({ db: { select: vi.fn(), insert: vi.fn() } }));
vi.mock("@/db/schema", () => ({
  units: {},
  lessons: {},
  unitStandards: {},
  standards: {},
  lessonStandards: {},
}));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), asc: vi.fn() }));

// ── Import after mocks ────────────────────────────────────────────────────────

import { POST } from "../../src/app/api/units/[id]/infer-standards/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeContext(id = "unit-123") {
  return { params: Promise.resolve({ id }) };
}

function makeRequest() {
  return new Request("http://localhost/api/units/unit-123/infer-standards", { method: "POST" });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/units/[id]/infer-standards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue(null);
  });

  it("returns 401 when there is no session", async () => {
    const res = await POST(makeRequest(), makeContext());

    expect(res.status).toBe(401);
  });

  it("does not call the Anthropic SDK when unauthenticated", async () => {
    await POST(makeRequest(), makeContext());

    expect(mockMessagesCreate).not.toHaveBeenCalled();
  });
});
