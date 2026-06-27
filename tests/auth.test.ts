import { describe, it, expect } from "vitest";
import { authOptions } from "@/lib/auth";
import GoogleProvider from "next-auth/providers/google";

describe("authOptions Google OAuth scope", () => {
  const provider = authOptions.providers[0] as ReturnType<typeof GoogleProvider>;
  const scope: string = (
    provider as unknown as { options: { authorization: { params: { scope: string } } } }
  ).options.authorization.params.scope;

  it("requests drive.readonly instead of the full drive scope", () => {
    expect(scope).toContain("https://www.googleapis.com/auth/drive.readonly");
  });

  it("requests drive.file for app-created-file write access", () => {
    expect(scope).toContain("https://www.googleapis.com/auth/drive.file");
  });

  it("does not request the overly broad drive scope", () => {
    // Ensure the bare /auth/drive scope is absent (not just a substring of drive.readonly or drive.file)
    const scopes = scope.split(" ");
    expect(scopes).not.toContain("https://www.googleapis.com/auth/drive");
  });
});
