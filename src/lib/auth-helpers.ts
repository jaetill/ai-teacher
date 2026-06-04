import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * Returns the authenticated user's email or null if the session is missing / has no email.
 * Routes use this to guard endpoints and scope DB queries by owner.
 */
export async function getUserEmail(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.email ?? null;
}
