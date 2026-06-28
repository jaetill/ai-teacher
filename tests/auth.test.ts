import { describe, it, expect } from "vitest";
import { authOptions } from "@/lib/auth";
import GoogleProvider from "next-auth/providers/google";
import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";

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

describe("authOptions.callbacks.session", () => {
  const sessionCallback = authOptions.callbacks!.session!;

  function makeSession(user?: Partial<Session["user"]>): Session {
    return {
      expires: "2099-01-01",
      user: user as Session["user"],
    } as Session;
  }

  function makeToken(sub?: string, accessToken?: string): JWT {
    return { sub, accessToken } as JWT;
  }

  it("sets session.user.id to token.sub when both are present", async () => {
    const session = makeSession({ email: "teacher@school.edu" });
    const token = makeToken("user-sub-123", "access-tok");

    const result = await sessionCallback({
      session,
      token,
      user: {} as never,
      newSession: null,
      trigger: "update",
    });

    expect((result.user as { id?: string }).id).toBe("user-sub-123");
  });

  it("does NOT expose accessToken on the client session (#507)", async () => {
    const session = makeSession({ email: "teacher@school.edu" });
    const token = makeToken("user-sub-123", "my-access-token");

    const result = await sessionCallback({
      session,
      token,
      user: {} as never,
      newSession: null,
      trigger: "update",
    });

    // The Drive OAuth token must stay server-side (read via getAccessToken),
    // never serialized onto the session that reaches the client.
    expect((result as Session & { accessToken?: string }).accessToken).toBeUndefined();
  });

  it("does not set user.id when session.user is absent", async () => {
    const session = makeSession(undefined);
    const token = makeToken("user-sub-123", "access-tok");

    // Should not throw and should return without user.id set
    const result = await sessionCallback({
      session,
      token,
      user: {} as never,
      newSession: null,
      trigger: "update",
    });

    expect(result.user).toBeUndefined();
  });

  it("does not set user.id when token.sub is absent", async () => {
    const session = makeSession({ email: "teacher@school.edu" });
    const token = makeToken(undefined, "access-tok");

    const result = await sessionCallback({
      session,
      token,
      user: {} as never,
      newSession: null,
      trigger: "update",
    });

    expect((result.user as { id?: string }).id).toBeUndefined();
  });
});

describe("authOptions.callbacks.jwt (#508)", () => {
  const jwtCallback = authOptions.callbacks!.jwt!;
  type JwtArgs = Parameters<typeof jwtCallback>[0];

  it("copies access + refresh tokens from the account onto the JWT on sign-in", async () => {
    const token = { sub: "user-1" } as JWT;
    const account = { access_token: "at-123", refresh_token: "rt-456" };
    const result = (await jwtCallback({ token, account } as unknown as JwtArgs)) as JWT & {
      accessToken?: string;
      refreshToken?: string;
    };
    expect(result.accessToken).toBe("at-123");
    expect(result.refreshToken).toBe("rt-456");
  });

  it("leaves the JWT unchanged on later calls when no account is present", async () => {
    const token = { sub: "user-1", accessToken: "existing" } as JWT & { accessToken?: string };
    const result = (await jwtCallback({ token, account: null } as unknown as JwtArgs)) as JWT & {
      accessToken?: string;
    };
    expect(result.accessToken).toBe("existing");
  });
});
