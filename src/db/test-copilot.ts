// Quick test: verify copilot conversation DB writes work
// Run with: npx tsx src/db/test-copilot.ts

import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function test() {
  const convs =
    await sql`SELECT id, message_count, created_at FROM copilot_conversations ORDER BY created_at DESC LIMIT 5`;
  console.log("Recent conversations:", convs.length ? convs : "(none yet)");

  const msgs =
    await sql`SELECT conversation_id, role, substr(content, 1, 80) as content_preview, sort_order FROM copilot_messages ORDER BY created_at DESC LIMIT 10`;
  console.log("Recent messages:", msgs.length ? msgs : "(none yet)");
}

test().catch(console.error);
