// One-time backfill: set owner_email on all units that have owner_email IS NULL.
// Required before onboarding a second user (see ADR-0021).
//
// Usage:
//   OWNER_EMAIL=teacher@example.com DATABASE_URL=postgres://... npx tsx scripts/backfill-owner-email.ts
//
// Reads DATABASE_URL from the environment (falls back to .env.local).
// Idempotent: only rows with owner_email IS NULL are updated.

import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { units } from "../src/db/schema";
import { isNull } from "drizzle-orm";

const ownerEmail = process.env.OWNER_EMAIL;
if (!ownerEmail) {
  console.error("Error: OWNER_EMAIL environment variable is required.");
  console.error("  OWNER_EMAIL=teacher@example.com npx tsx scripts/backfill-owner-email.ts");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Error: DATABASE_URL environment variable is required.");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });
const db = drizzle(pool);

const result = await db
  .update(units)
  .set({ ownerEmail })
  .where(isNull(units.ownerEmail))
  .returning({ id: units.id });

console.log(`Backfilled ${result.length} unit(s) with owner_email = "${ownerEmail}".`);

await pool.end();
