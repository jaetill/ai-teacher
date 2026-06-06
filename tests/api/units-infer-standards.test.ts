import { describe, it, expect, vi } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

vi.mock("@/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/db/schema", () => ({
  units: {},
  lessons: {},
  unitStandards: {},
  standards: {},
  lessonStandards: {},
}));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), asc: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => {
  const Anthropic = vi.fn(function () {
    return { messages: { create: vi.fn() } };
  });
  return { default: Anthropic };
});

import { getServerSession } from "next-auth";
import { db } from "@/db";
import { POST } from "../../src/app/api/units/[id]/infer-standards/route";

const mockGetServerSession = vi.mocked(getServerSession);
const mockDb = vi.mocked(db);

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/units/[id]/infer-standards", () => {
  it("returns 401 when there is no session", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await POST(
      new Request("http://localhost/api/units/abc/infer-standards", { method: "POST" }),
      makeParams("abc"),
    );

    expect(res.status).toBe(401);
  });

  it("does not query the database when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    await POST(
      new Request("http://localhost/api/units/abc/infer-standards", { method: "POST" }),
      makeParams("abc"),
    );

    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("returns 403 when authenticated user does not own the unit", async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: "user-a", email: "a@example.com" },
      expires: "",
    } as never);

    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: "unit-1", userId: "user-b", title: "Unit 1" }]),
    };
    mockDb.select.mockReturnValue(selectChain as never);

    const res = await POST(
      new Request("http://localhost/api/units/unit-1/infer-standards", { method: "POST" }),
      makeParams("unit-1"),
    );

    expect(res.status).toBe(403);
  });
});
