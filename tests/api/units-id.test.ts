import { describe, it, expect, vi } from "vitest";

// Mock next-auth before importing the route.
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

// Mock the DB so the test never hits a real database.
vi.mock("@/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/db/schema", () => ({}));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), asc: vi.fn(), inArray: vi.fn(), and: vi.fn() }));

import { getServerSession } from "next-auth";
import { GET } from "../../src/app/api/units/[id]/route";

const mockGetServerSession = vi.mocked(getServerSession);

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/units/[id]", () => {
  it("returns 401 when there is no session", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await GET(new Request("http://localhost/api/units/abc"), makeParams("abc"));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Not authenticated");
  });
});
