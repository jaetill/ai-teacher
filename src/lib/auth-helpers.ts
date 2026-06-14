import type { Session } from "next-auth";

/**
 * Returns the authenticated user's email or null if absent.
 * Callers that require an email should return 401 when this returns null.
 */
export function requireEmail(session: Session): string | null {
  return session.user?.email ?? null;
}
