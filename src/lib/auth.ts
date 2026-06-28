import GoogleProvider from "next-auth/providers/google";
import type { NextAuthOptions } from "next-auth";

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
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
      }
      return token;
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
