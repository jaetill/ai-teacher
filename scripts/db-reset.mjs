// Truncates the teacher's imported curriculum so it can be reimported from
// scratch. Seeded reference data (standards, lesson templates, school years,
// terms, glossary) is preserved by default — wiping it would force a reseed
// and has nothing to do with testing the import pipeline.
//
//   npm run db:reset -- --dry-run          → list what would be wiped
//   npm run db:reset -- --confirm          → wipe curriculum data
//   npm run db:reset -- --confirm --all    → wipe reference data too
//   npm run db:reset -- --confirm --keep standards,school_years
//   npm run db:reset -- --confirm --prod   → required when DATABASE_URL is production
//
// Refuses to run without --confirm, and refuses a production host without
// --prod. Take a backup first (npm run db:backup).
import { sql } from "drizzle-orm";
import { connect, listTables, topoSort, quoteIdent, REFERENCE_TABLES } from "./lib/db-tools.mjs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const confirmed = args.includes("--confirm");
const wipeAll = args.includes("--all");
const keepIdx = args.indexOf("--keep");
const keepArg = keepIdx !== -1 ? args[keepIdx + 1] : null;
if (keepIdx !== -1 && (!keepArg || keepArg.startsWith("--"))) {
  console.error("--keep needs a comma-separated table list");
  process.exit(1);
}

if (!dryRun && !confirmed) {
  console.error("This deletes data. Re-run with --dry-run to preview, or --confirm to proceed.");
  process.exit(1);
}

const db = connect({ destructive: !dryRun });

const all = await topoSort(db, await listTables(db));
const keep = new Set(
  keepArg
    ? keepArg
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : wipeAll
      ? ["__drizzle_migrations"]
      : REFERENCE_TABLES,
);

const unknown = [...keep].filter((t) => !all.includes(t));
if (unknown.length) {
  console.error(`--keep names tables that do not exist: ${unknown.join(", ")}`);
  process.exit(1);
}

const targets = all.filter((t) => !keep.has(t));
if (!targets.length) {
  console.log("nothing to wipe");
  process.exit(0);
}

// Row counts first, so --dry-run is informative and the confirmed run leaves a
// record of what it destroyed.
console.log(`Host: ${new URL(process.env.DATABASE_URL).host}\n`);
console.log("Will truncate:");
let total = 0;
for (const t of targets) {
  const res = await db.execute(sql.raw(`SELECT count(*)::int AS n FROM ${quoteIdent(t)}`));
  const n = res.rows[0].n;
  total += n;
  console.log(`  ${String(n).padStart(6)}  ${t}`);
}
console.log(`\nPreserving: ${[...keep].sort().join(", ") || "(nothing)"}`);
console.log(`Total rows to delete: ${total}`);

if (dryRun) {
  console.log("\n--dry-run: nothing was deleted");
  process.exit(0);
}

// One statement so it is atomic — the neon-http driver has no interactive
// transactions (db.transaction() throws), but a single TRUNCATE is all-or-nothing.
// CASCADE covers FK children that live in the preserved set.
const list = targets.map(quoteIdent).join(", ");
await db.execute(sql.raw(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`));

console.log(`\ntruncated ${targets.length} tables (${total} rows)`);
