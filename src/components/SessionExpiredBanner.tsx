"use client";

// #651: when the server can no longer refresh the Google access token (e.g.
// the refresh token was revoked or expired), the NextAuth session stays alive
// but every Drive-backed feature quietly 401s — the 2026-07-30 incident showed
// up as "5 files failed" with no explanation. The session callback surfaces
// that state as session.googleAuthError; this banner turns it into one clear,
// actionable message. signIn("google") re-runs the OAuth flow (prompt=consent)
// and mints fresh tokens without losing any app data.

import { useSession, signIn } from "next-auth/react";

export default function SessionExpiredBanner() {
  const { data: session } = useSession();

  if (!session?.googleAuthError) return null;

  return (
    <div className="bg-amber-50 dark:bg-amber-950 border-b border-amber-200 dark:border-amber-800 px-4 py-2 flex items-center justify-center gap-3 text-sm">
      <span className="text-amber-800 dark:text-amber-200">
        Your Google sign-in has expired, so Drive features (import, summaries,
        drafts) will fail until you sign in again.
      </span>
      <button
        onClick={() => signIn("google")}
        className="shrink-0 font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg px-3 py-1 transition-colors"
      >
        Sign in again
      </button>
    </div>
  );
}
