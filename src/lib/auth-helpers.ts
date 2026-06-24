// Auth helpers — resolve the caller's identity for owner-scoped routes.
//
// Authorization model (ADR-0024): every protected API route resolves the
// caller's email and scopes all DB reads/writes by `ownerEmail = thatEmail`.
// These helpers are the single, consistent entry point for that resolution so
// no route has to re-derive "who is calling" or hand-roll the unauthenticated
// branch.
//
// #228: the previous shape returned `null` on BOTH "no session" and "session
// without an email", which callers conflated with "found no rows" — a bug that
// silently turned auth failures into 200s. `requireEmail` now returns a
// DISCRIMINATED result: either `{ email }` or `{ response }` (a ready-to-return
// 401). Unauthenticated can never be mistaken for a value.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export type RequireEmailResult =
  | { email: string; response?: undefined }
  | { email?: undefined; response: Response };

/**
 * Resolve the authenticated caller's email, or produce a 401 to return.
 *
 * Usage in a route handler:
 *   const auth = await requireEmail();
 *   if (auth.response) return auth.response;
 *   const email = auth.email; // narrowed to string
 *
 * The 401 path covers both "no session at all" and "session without an email"
 * — neither is a legitimate authenticated caller for an owner-scoped route.
 */
export async function requireEmail(): Promise<RequireEmailResult> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return {
      response: Response.json(
        { error: "Not authenticated" },
        { status: 401 }
      ),
    };
  }
  return { email };
}
