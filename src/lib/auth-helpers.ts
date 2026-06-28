import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";
import type { Session } from "next-auth";
import type { NextRequest } from "next/server";

export async function getUserEmail(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.email ?? null;
}

/**
 * Read the Google OAuth access token from the JWT, server-side only.
 * The token is stored on the JWT by the `jwt` callback but is deliberately
 * kept off the client-visible Session (#507), so Drive/upload routes must
 * fetch it here. Returns null when unauthenticated or the token is absent.
 * Uses NEXTAUTH_SECRET from the environment (same secret as getServerSession).
 */
export async function getAccessToken(req: Request): Promise<string | null> {
  const token = await getToken({ req: req as unknown as NextRequest });
  return token?.accessToken ?? null;
}

/** Extract email from an already-fetched session; returns null when missing. */
export function requireEmail(session: Session | null): string | null {
  return session?.user?.email ?? null;
}
