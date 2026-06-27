import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth";
import { getUserEmail } from "../../src/lib/auth-helpers";

const mockGetServerSession = vi.mocked(getServerSession);

describe("getUserEmail()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when getServerSession returns null", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const result = await getUserEmail();

    expect(result).toBeNull();
  });

  it("returns null when session exists but user.email is undefined", async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: {}, expires: "" });

    const result = await getUserEmail();

    expect(result).toBeNull();
  });

  it("returns the email string when session has a valid email", async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { email: "teacher@school.edu" },
      expires: "",
    });

    const result = await getUserEmail();

    expect(result).toBe("teacher@school.edu");
  });
});
