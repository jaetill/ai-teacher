import { config } from "dotenv";
config({ path: ".env.local" });

// One-time migration: remap old material types to new categories
// Old: presentation, worksheet, reading, rubric, answer_key, handout, video_link, supplementary, other
// New: reading, activity, rubric, lesson, assessment, resource, curriculum, other
//
// Run with: npx tsx src/db/migrate-material-types.ts

import { db } from "./index";
import { materials } from "./schema";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

const REMAP: Record<string, string> = {
  presentation: "lesson",
  worksheet: "activity",
  answer_key: "assessment",
  supplementary: "resource",
  video_link: "resource",
  // handout → best guess per file; default to "lesson"
  handout: "lesson",
  // These stay the same:
  // reading → reading
  // rubric → rubric
  // other → other
};

async function migrate() {
  console.log("Migrating material types...\n");

  for (const [oldType, newType] of Object.entries(REMAP)) {
    const result = await db
      .update(materials)
      .set({ materialType: newType, updatedAt: new Date() })
      .where(eq(materials.materialType, oldType));

    console.log(`  ${oldType} → ${newType}: updated`);
  }

  // Summary
  const counts = await db
    .select({
      materialType: materials.materialType,
      count: sql<number>`count(*)`,
    })
    .from(materials)
    .groupBy(materials.materialType);

  console.log("\nFinal distribution:");
  for (const row of counts) {
    console.log(`  ${row.materialType}: ${row.count}`);
  }

  console.log("\nDone.");
  process.exit(0);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
