// Repairs the one invented standard: 8.C.1.B.
//
// Run with:  npx tsx scripts/repair-8-C-1-B.ts --dry-run
//            npx tsx scripts/repair-8-C-1-B.ts --apply
//
// ── What is wrong ───
//
// 8.C.1.B is not a VA SOL standard. VDOE's 8.C.1 ("Communication, Listening,
// and Collaboration") has a single indicator, A. The old IXL-derived seed split
// off a multimodal-presentation item and numbered it B:
//
//     8.C.1.B  "Create multimodal presentations that effectively convey ideas."
//
// That content is VDOE's 8.C.3.A ("Plan and present a multimodal presentation
// that i. Sequences ideas logically. …"), which now exists in the database.
//
// ── Why this is not in the seed ───
//
// Heidi has real alignment mapped to 8.C.1.B — 4 units and 10 lessons at the
// time of writing. Deleting the row would either fail on the foreign key or
// silently strip standards off lessons she has already planned and taught
// against. Re-pointing that alignment at 8.C.3.A is a judgment about her
// curriculum, not a schema fix, so it runs deliberately and prints what it
// will touch before it touches anything.
//
// The re-point is safe in the sense that matters: 8.C.3.A is what she meant.
// The lesson tagged "create a multimodal presentation" is aligned to the
// standard about multimodal presentations either way. But it is her call.

import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

const FROM = "8.C.1.B";
const TO = "8.C.3.A";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const apply = process.argv.includes("--apply");
  if (!apply && !process.argv.includes("--dry-run")) {
    console.error("Pass --dry-run to preview or --apply to make the change.");
    process.exit(1);
  }

  const target = await sql`select id from standards where id = ${TO}`;
  if (target.length === 0) {
    console.error(`${TO} does not exist yet. Run src/db/seed-standards.ts first.`);
    process.exit(1);
  }

  const units = await sql`
    select u.id, u.title from unit_standards us
    join units u on u.id = us.unit_id
    where us.standard_id = ${FROM} order by u.title`;
  const lessons = await sql`
    select l.id, l.title from lesson_standards ls
    join lessons l on l.id = ls.lesson_id
    where ls.standard_id = ${FROM} order by l.title`;

  console.log(`\n${FROM} → ${TO}\n`);
  console.log(`Units (${units.length}):`);
  for (const u of units) console.log(`  - ${u.title}`);
  console.log(`\nLessons (${lessons.length}):`);
  for (const l of lessons) console.log(`  - ${l.title}`);

  if (!apply) {
    console.log(
      `\nDry run. Nothing changed. Re-run with --apply to move these and delete ${FROM}.`,
    );
    return;
  }

  // Re-point, skipping rows that would collide with an existing (entity, TO)
  // pair — a lesson already aligned to both would otherwise violate the
  // composite primary key.
  await sql`
    delete from unit_standards
    where standard_id = ${FROM}
      and unit_id in (select unit_id from unit_standards where standard_id = ${TO})`;
  await sql`update unit_standards set standard_id = ${TO} where standard_id = ${FROM}`;

  await sql`
    delete from lesson_standards
    where standard_id = ${FROM}
      and lesson_id in (select lesson_id from lesson_standards where standard_id = ${TO})`;
  await sql`update lesson_standards set standard_id = ${TO} where standard_id = ${FROM}`;

  await sql`delete from standards where id = ${FROM}`;

  console.log(`\nDone. ${FROM} removed; alignment now points at ${TO}.`);
}

main().catch((err) => {
  console.error("Repair failed:", err);
  process.exit(1);
});
