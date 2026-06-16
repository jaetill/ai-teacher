import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/db/schema", () => ({
  courses: {},
  units: {},
  lessons: {},
  assessments: {},
  materialAttachments: {},
  materials: {},
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  asc: vi.fn(),
  inArray: vi.fn(),
  and: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { GET } from "../../../../src/app/api/curriculum/editor/data/route";

const mockSession = vi.mocked(getServerSession);

function makeRequest(courseId?: string) {
  const url = courseId
    ? `http://localhost/api/curriculum/editor/data?courseId=${courseId}`
    : "http://localhost/api/curriculum/editor/data";
  return new Request(url);
}

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("GET /api/curriculum/editor/data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no session", async () => {
    mockSession.mockResolvedValueOnce(null);

    const res = await GET(makeRequest(VALID_UUID));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Not authenticated");
  });

  it("returns 400 when courseId is missing", async () => {
    mockSession.mockResolvedValueOnce({
      user: { email: "teacher@example.com" },
      expires: "",
    });

    const res = await GET(makeRequest());

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("courseId required");
  });

  it("returns 400 when courseId is not a valid UUID", async () => {
    mockSession.mockResolvedValueOnce({
      user: { email: "teacher@example.com" },
      expires: "",
    });

    const res = await GET(makeRequest("not-a-uuid"));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("courseId required");
  });

  it("returns 400 for an empty courseId string", async () => {
    mockSession.mockResolvedValueOnce({
      user: { email: "teacher@example.com" },
      expires: "",
    });

    const res = await GET(makeRequest(""));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("courseId required");
  });

  it("returns 400 for a UUID-like string with wrong segment lengths", async () => {
    mockSession.mockResolvedValueOnce({
      user: { email: "teacher@example.com" },
      expires: "",
    });

    const res = await GET(makeRequest("550e8400-e29b-41d4-a716-44665544000"));

    expect(res.status).toBe(400);
  });
});
