import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCreate, mockGetServerSession, mockDbSelect } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockGetServerSession: vi.fn(),
  mockDbSelect: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => {
  function Anthropic() {
    return { messages: { create: mockCreate } };
  }
  return { default: Anthropic };
});

vi.mock("next-auth", () => ({ getServerSession: mockGetServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

vi.mock("@/db", () => ({
  db: { select: mockDbSelect, insert: vi.fn() },
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return { ...actual, eq: vi.fn(), asc: vi.fn() };
});

vi.mock("@/db/schema", () => ({
  units: {},
  lessons: {},
  unitStandards: {},
  standards: {},
  lessonStandards: {},
}));

import { POST } from "../../src/app/api/units/[id]/infer-standards/route";

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/units/[id]/infer-standards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const res = await POST(
      new Request("http://localhost/api/units/abc/infer-standards", { method: "POST" }),
      makeParams("abc"),
    );

    expect(res.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns 403 when authenticated user does not own the unit", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "google-sub-alice" } });

    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi
        .fn()
        .mockResolvedValue([{ id: "unit-1", title: "Unit 1", userId: "google-sub-bob" }]),
    };
    mockDbSelect.mockReturnValue(chain);

    const res = await POST(
      new Request("http://localhost/api/units/unit-1/infer-standards", { method: "POST" }),
      makeParams("unit-1"),
    );

    expect(res.status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("does not call Anthropic when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);

    await POST(
      new Request("http://localhost/api/units/unit-1/infer-standards", { method: "POST" }),
      makeParams("unit-1"),
    );

    expect(mockCreate).not.toHaveBeenCalled();
  });
});
