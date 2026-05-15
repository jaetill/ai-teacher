import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type DB = NeonHttpDatabase<typeof schema>;

// Defer neon() until first DB access. Next.js's "Collecting page data" build
// step evaluates every API route's module graph; reading DATABASE_URL at
// module load makes builds fail in any environment that scopes the var
// (Preview/Development) instead of injecting it everywhere.
let cached: DB | undefined;

function getDb(): DB {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL is not set. Configure it in .env.local for local dev, " +
          "or in Vercel project settings (Production + Preview + Development).",
      );
    }
    cached = drizzle(neon(url), { schema });
  }
  return cached;
}

export const db = new Proxy({} as DB, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});
