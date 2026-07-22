import GoogleProvider from "next-auth/providers/google";
import type { NextAuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";

// Refresh the Google access token using the stored refresh token. Google
// access tokens expire after ~1 hour while the NextAuth session lasts 30 days;
// without this, every Drive-backed route starts failing with Google 401s an
// hour after sign-in even though the user still appears logged in.
async function refreshGoogleToken(token: JWT): Promise<JWT> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken!,
      }),
    });
    const data: {
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
      error?: string;
    } = await res.json();
    if (!res.ok || !data.access_token) {
      throw new Error(data.error ?? `refresh failed (${res.status})`);
    }
    return {
      ...token,
      accessToken: data.access_token,
      // Google may rotate the refresh token; keep the old one if it doesn't.
      refreshToken: data.refresh_token ?? token.refreshToken,
      expiresAt: Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
      refreshError: undefined,
    };
  } catch (err) {
    console.error("[auth] Google token refresh failed:", err);
    // Keep the session alive (DB-backed routes still work); Drive routes will
    // get a stale token and surface a Google auth error until re-login.
    return { ...token, refreshError: "RefreshAccessTokenError" };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    // Restrict sign-in to an allowlist when ALLOWED_EMAILS is set (comma-
    // separated, case-insensitive). When unset, any Google account can sign in
    // — acceptable for local dev, but set it in Vercel: this app is public and
    // every signed-in user can stream paid Anthropic completions.
    async signIn({ user }) {
      const allow = process.env.ALLOWED_EMAILS;
      if (!allow) return true;
      const list = allow
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
      return !!user.email && list.includes(user.email.toLowerCase());
    },
    async jwt({ token, account }) {
      if (account) {
        // Initial sign-in
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at; // epoch seconds
        return token;
      }
      // Still valid (with 60s slack)? Keep as-is.
      if (token.expiresAt && Date.now() < (token.expiresAt - 60) * 1000) {
        return token;
      }
      // Expired (or legacy token with no expiry recorded) — refresh if we can.
      if (!token.refreshToken) return token;
      return refreshGoogleToken(token);
    },
    async session({ session, token }) {
      // Deliberately NOT exposing the Google access/refresh token on the session:
      // the session is serialized to the client (readable via /api/auth/session
      // and any client JS), so putting the Drive-scoped OAuth token there gives
      // an XSS an easy exfiltration target (#507). Server code that needs the
      // token reads it from the JWT via getAccessToken() (src/lib/auth-helpers).
      if (session.user) session.user.id = token.sub;
      return session;
    },
  },
};
