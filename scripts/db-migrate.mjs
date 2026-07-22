// Applies pending drizzle migrations over the Neon HTTP driver.
//
// Why not `drizzle-kit migrate`? It connects over websockets, which silently
// no-op on some networks (observed 2026-07-22: exit code 0, nothing applied,
// nothing recorded). The HTTP driver is the same transport the app itself
// uses, so if the app can reach the DB, so can this script.
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { config } from "dotenv";

config({ path: ".env.local" });
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (checked .env.local and environment)");
  process.exit(1);
}
const db = drizzle(neon(process.env.DATABASE_URL));
await migrate(db, { migrationsFolder: "./drizzle" });
console.log("migrations are up to date");
