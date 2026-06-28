import "next-auth";

declare module "next-auth" {
  interface Session {
    // NOTE: accessToken is intentionally NOT on the Session — it must not be
    // serialized to the client (#507). Read it server-side via getAccessToken().
    user?: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
  }
}
