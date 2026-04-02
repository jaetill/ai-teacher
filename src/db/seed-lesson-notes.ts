// Seed script: imports teacher comments from the Grade 8 Q1 Timeline
// document into lesson teacherNotes fields.
//
// Comment-to-lesson mapping derived from the document's comment anchors.
// Run with: npx tsx src/db/seed-lesson-notes.ts

import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { lessons } from "./schema/lessons";
import { units } from "./schema/units";
import { eq, and } from "drizzle-orm";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

// ── Comment-to-lesson mapping ───
// Extracted from word/comments.xml + word/document.xml anchor positions.
// Key = lesson sortOrder, Value = array of comment texts.
const commentsByDay: Record<number, string[]> = {
  3: [
    "Bystander Effect, Herd Behavior - 2 Days. Possibly move to Week 2.",
    "Text/Source activity with Hiding Place: Key Moment of Silence or Speech — who was silent or courageous? Why? What were the consequences? One powerful quote. Theme or concept this connects to (fear, peer pressure, hope, conformity).",
  ],
  4: [
    "Bystander Effect, Herd Behavior - 2 Days. Possibly move to Week 2.",
    "May switch order.",
    "Introduce author's voice and tone as point of comparison — sorting tone activity?",
  ],
  5: [
    "Intro to Night: 2 Days.",
    "Omit stations.",
  ],
  8: [
    // Week 4 comment — applies to start of Week 4 (Day 8)
    "May switch order.",
    "Introduce author's voice and tone as point of comparison — sorting tone activity?",
  ],
  11: [
    "Skills: Similes and metaphors, conflict, setting's effect on tone.",
    "May incorporate some into the notes.",
  ],
  14: [
    // Listed as Day 16 in doc but maps to sortOrder 14 (Night Book 3)
    "Allusion, Cause and Effect in Plot.",
    "Sorting Tone Activity.",
  ],
  17: [
    // Listed as Day 19 in doc but maps to sortOrder 17 (Night Book 4)
    "Theme, Irony.",
    "Author's Voice activity.",
  ],
};

async function seed() {
  // Find the Q1 unit
  const allUnits = await db.select().from(units);
  const q1Unit = allUnits.find((u) =>
    u.title.includes("Night & The Hiding Place")
  );

  if (!q1Unit) {
    console.error("Q1 unit not found!");
    process.exit(1);
  }

  console.log(`Found unit: ${q1Unit.title} (${q1Unit.id})`);

  // Get all lessons for this unit
  const unitLessons = await db
    .select()
    .from(lessons)
    .where(eq(lessons.unitId, q1Unit.id));

  let updated = 0;

  for (const [dayStr, comments] of Object.entries(commentsByDay)) {
    const day = parseInt(dayStr);
    const lesson = unitLessons.find((l) => l.sortOrder === day);
    if (!lesson) {
      console.log(`  No lesson found for day ${day}, skipping`);
      continue;
    }

    // Merge with any existing notes
    const existing = lesson.teacherNotes ?? "";
    const newNotes = comments.join("\n");
    const merged = existing
      ? `${existing}\n\n--- From timeline comments (summer 2025) ---\n${newNotes}`
      : `From timeline comments (summer 2025):\n${newNotes}`;

    await db
      .update(lessons)
      .set({ teacherNotes: merged, updatedAt: new Date() })
      .where(eq(lessons.id, lesson.id));

    console.log(`  Day ${day} "${lesson.title}": ${comments.length} comments`);
    updated++;
  }

  console.log(`\nDone! Updated ${updated} lessons with teacher notes.`);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
