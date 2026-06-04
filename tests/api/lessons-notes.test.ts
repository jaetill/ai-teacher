import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetServerSession, mockReturning } = vi.hoisted(() => {
  const mockReturning = vi.fn();
  return {
    mockGetServerSession: vi.fn(),
    mockReturning,
  };
});

vi.mock("next-auth", () => ({ getServerSession: mockGetServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

vi.mock("@/db", () => ({
  db: {
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({ returning: mockReturning })),
      })),
    })),
  },
}));
vi.mock("@/db/schema", () => ({ lessons: {} }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

import { POST } from "../../src/app/api/lessons/[id]/notes/route";

function makeRequest(body: unknown = { notes: "test note" }) {
  return new Request("http://localhost/api/lessons/abc/notes", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function makeParams(id = "abc") {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/lessons/[id]/notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Not authenticated");
  });

  it("saves notes and returns ok when authenticated", async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: "teacher@example.com" } });
    mockReturning.mockResolvedValue([{ id: "abc" }]);

    const res = await POST(makeRequest({ notes: "Great lesson" }), makeParams());

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("returns 404 when lesson does not exist", async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: "teacher@example.com" } });
    mockReturning.mockResolvedValue([]);

    const res = await POST(makeRequest(), makeParams("nonexistent"));

    expect(res.status).toBe(404);
  });
});
