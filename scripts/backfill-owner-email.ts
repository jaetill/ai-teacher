// One-time backfill: set owner_email on every course row that still has NULL.
//
// Run before adding a second authenticated user to prevent IDOR access to
// pre-migration courses. See issue #204 for context.
//
// Usage:
//   OWNER_EMAIL=teacher@school.edu npx tsx scripts/backfill-owner-email.ts

import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { isNull } from "drizzle-orm";
import { courses } from "../src/db/schema/courses";

const ownerEmail = process.env.OWNER_EMAIL;
if (!ownerEmail) {
  console.error("Error: OWNER_EMAIL env var is required.");
  console.error("Usage: OWNER_EMAIL=teacher@school.edu npx tsx scripts/backfill-owner-email.ts");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

const updated = await db
  .update(courses)
  .set({ ownerEmail })
  .where(isNull(courses.ownerEmail))
  .returning({ id: courses.id });

console.log(`Backfill complete: set owner_email='${ownerEmail}' on ${updated.length} course(s).`);
