import type { Session } from "next-auth";

/**
 * Returns the verified email from a session, or null if absent.
 * Use after getServerSession to extract the email claim consistently.
 */
export function requireEmail(session: Session | null): string | null {
  return session?.user?.email ?? null;
}
