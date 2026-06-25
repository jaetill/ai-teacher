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
import { GET } from "../../src/app/api/curriculum/editor/data/route";

const mockGetServerSession = vi.mocked(getServerSession);

describe("GET /api/curriculum/editor/data", () => {
  it("returns 401 when there is no session", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const res = await GET(
      new Request(
        "http://localhost/api/curriculum/editor/data?courseId=00000000-0000-0000-0000-000000000000",
      ),
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Not authenticated");
  });
});
