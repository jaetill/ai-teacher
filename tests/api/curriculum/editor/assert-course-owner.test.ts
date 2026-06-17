import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/db/schema", () => ({ courses: {} }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

import { db } from "@/db";
import { assertCourseOwner } from "../../../../src/app/api/curriculum/editor/assert-course-owner";

const mockDb = vi.mocked(db);

function makeChain(result: unknown) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  };
  mockDb.select.mockReturnValue(chain as never);
  return chain;
}

const COURSE_ID = "550e8400-e29b-41d4-a716-446655440000";
const OWNER_EMAIL = "teacher@example.com";
const OTHER_EMAIL = "other@example.com";

function makeSession(email: string | null | undefined) {
  return { user: { email }, expires: "" } as never;
}

describe("assertCourseOwner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when the session email matches the course ownerEmail", async () => {
    makeChain([{ ownerEmail: OWNER_EMAIL }]);

    const result = await assertCourseOwner(COURSE_ID, makeSession(OWNER_EMAIL));

    expect(result).toBeNull();
  });

  it("returns 403 when the session email does not match the course ownerEmail", async () => {
    makeChain([{ ownerEmail: OWNER_EMAIL }]);

    const result = await assertCourseOwner(COURSE_ID, makeSession(OTHER_EMAIL));

    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
    const body = await result!.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 403 when the course has no ownerEmail (null)", async () => {
    makeChain([{ ownerEmail: null }]);

    const result = await assertCourseOwner(COURSE_ID, makeSession(OWNER_EMAIL));

    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it("returns 403 when the course is not found", async () => {
    makeChain([]);

    const result = await assertCourseOwner(COURSE_ID, makeSession(OWNER_EMAIL));

    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it("returns 403 when the session has no email", async () => {
    makeChain([{ ownerEmail: OWNER_EMAIL }]);

    const result = await assertCourseOwner(COURSE_ID, makeSession(null));

    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });
});
