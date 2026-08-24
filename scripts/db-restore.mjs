// Restores a JSON dump produced by scripts/db-backup.mjs.
//
//   npm run db:restore -- backups/2026-08-24T1930Z_pre-import-rebuild --dry-run
//   npm run db:restore -- backups/2026-08-24T1930Z_pre-import-rebuild --confirm
//
// Inserts in the manifest's FK-safe order. By default it refuses to write into
// a table that already has rows — restore is meant to follow a reset, not to
// merge into live data. Pass --replace to truncate each restored table first.
//
// Schema is NOT restored. If the dump's migration hash differs from the live
// database, this warns and stops unless --force is given: replaying rows into a
// changed schema is exactly the kind of silent, half-successful operation that
// costs more to unpick than it saves.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import { connect, currentMigration, quoteIdent, chunk } from "./lib/db-tools.mjs";

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");
const confirmed = args.includes("--confirm");
const replace = args.includes("--replace");
const force = args.includes("--force");

if (!dir) {
  console.error(
    "usage: npm run db:restore -- <backup-dir> [--dry-run|--confirm] [--replace] [--force]",
  );
  process.exit(1);
}
if (!dryRun && !confirmed) {
  console.error("This writes data. Re-run with --dry-run to preview, or --confirm to proceed.");
  process.exit(1);
}

const manifest = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8"));
const db = connect();

console.log(`Restoring ${dir}`);
console.log(`  taken:  ${manifest.takenAt} (from ${manifest.databaseHost})`);
console.log(`  target: ${new URL(process.env.DATABASE_URL).host}\n`);

const live = await currentMigration(db);
const dumped = manifest.migration;
if (dumped?.hash !== live?.hash) {
  console.warn("WARNING: migration mismatch between dump and live database");
  console.warn(`  dump: ${dumped?.hash ?? "(unknown)"}`);
  console.warn(`  live: ${live?.hash ?? "(unknown)"}`);
  if (!force) {
    console.error(
      "\nRefusing to restore into a different schema. Re-run with --force if you are sure.",
    );
    process.exit(1);
  }
  console.warn("  --force given; continuing\n");
}

// Only restore tables the dump actually contains.
const present = new Set(
  (await readdir(dir))
    .filter((f) => f.endsWith(".json") && f !== "manifest.json")
    .map((f) => f.slice(0, -5)),
);
const order = manifest.tableOrder.filter((t) => present.has(t));

let planned = 0;
for (const table of order) {
  const rows = JSON.parse(await readFile(path.join(dir, `${table}.json`), "utf8"));
  if (!rows.length) continue;
  planned += rows.length;

  const existing = await db.execute(sql.raw(`SELECT count(*)::int AS n FROM ${quoteIdent(table)}`));
  const n = existing.rows[0].n;
  if (n > 0 && !replace) {
    console.error(
      `\n${table} already has ${n} rows. Reset first (npm run db:reset -- --confirm) or pass --replace.`,
    );
    process.exit(1);
  }

  console.log(`  ${String(rows.length).padStart(6)}  ${table}${n > 0 ? ` (replacing ${n})` : ""}`);
  if (dryRun) continue;

  if (n > 0) {
    await db.execute(sql.raw(`TRUNCATE TABLE ${quoteIdent(table)} CASCADE`));
  }

  // json_populate_recordset maps JSON keys onto the table's own column
  // definitions, so every type (jsonb, text[], timestamptz, date) round-trips
  // without per-column casting logic here.
  const q = quoteIdent(table);
  for (const batch of chunk(rows, 500)) {
    await db.execute(
      sql`INSERT INTO ${sql.raw(q)} SELECT * FROM json_populate_recordset(null::${sql.raw(q)}, ${JSON.stringify(batch)}::json)`,
    );
  }
}

if (dryRun) {
  console.log(`\n--dry-run: would restore ${planned} rows across ${order.length} tables`);
} else {
  console.log(`\nrestored ${planned} rows across ${order.length} tables`);
}
