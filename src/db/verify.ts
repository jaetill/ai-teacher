// Quick verification: query standards to confirm seed worked.
// Run with: npx tsx src/db/verify.ts

import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function verify() {
  const count = await sql`SELECT COUNT(*) as total FROM standards`;
  console.log("Total standards:", count[0].total);

  const byGrade =
    await sql`SELECT grade, COUNT(*) as count FROM standards GROUP BY grade ORDER BY grade`;
  console.log("\nStandards by grade:");
  console.table(byGrade);

  const courseList =
    await sql`SELECT id, title, grade FROM courses ORDER BY grade`;
  console.log("\nCourses:");
  console.table(courseList);

  const unitList =
    await sql`SELECT id, title, sort_order, duration_weeks, source FROM units ORDER BY sort_order`;
  console.log("\nUnits:");
  console.table(unitList);

  const unitStdCount =
    await sql`SELECT u.title, COUNT(us.standard_id) as standards_mapped FROM units u LEFT JOIN unit_standards us ON us.unit_id = u.id GROUP BY u.title`;
  console.log("\nUnit-Standards mapping:");
  console.table(unitStdCount);

  const lessonCount =
    await sql`SELECT COUNT(*) as total FROM lessons`;
  console.log("\nTotal lessons:", lessonCount[0].total);

  const lessonSample =
    await sql`SELECT sort_order, title FROM lessons ORDER BY sort_order LIMIT 5`;
  console.log("\nFirst 5 lessons:");
  console.table(lessonSample);
}

verify().catch(console.error);
