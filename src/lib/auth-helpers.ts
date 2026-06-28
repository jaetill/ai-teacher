import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import type { Session } from "next-auth";

export async function getUserEmail(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.email ?? null;
}

/** Extract email from an already-fetched session; returns null when missing. */
export function requireEmail(session: Session | null): string | null {
  return session?.user?.email ?? null;
}
