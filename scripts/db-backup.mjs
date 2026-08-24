// Dumps every public table to JSON under backups/<timestamp>/.
//
//   npm run db:backup                 → backups/2026-08-24T1930-00Z/
//   npm run db:backup -- --label pre-import-rebuild
//
// Why JSON and not pg_dump: no external tooling required, and — the reason
// that actually matters here — a JSON dump is diffable. The pre-wipe dump is
// the golden master the post-reimport database gets compared against, so
// "are we 100%?" is a diff, not a vibe check.
//
// This is a data dump, not a schema dump. Restoring assumes the same migration
// state; the manifest records which migration was applied so a mismatch is
// visible rather than silent. For structural rollback, use a Neon branch.
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { connect, listTables, topoSort, currentMigration, quoteIdent } from "./lib/db-tools.mjs";

const args = process.argv.slice(2);
const labelIdx = args.indexOf("--label");
const label = labelIdx !== -1 ? args[labelIdx + 1] : null;
if (labelIdx !== -1 && (!label || label.startsWith("--"))) {
  console.error("--label needs a value, e.g. --label pre-import-rebuild");
  process.exit(1);
}
if (label && !/^[A-Za-z0-9._-]+$/.test(label)) {
  console.error("--label may only contain letters, numbers, . _ and -");
  process.exit(1);
}

const db = connect();

const stamp = new Date()
  .toISOString()
  .replace(/[:.]/g, "-")
  .replace(/-\d+Z$/, "Z");
const dirName = label ? `${stamp}_${label}` : stamp;
const outDir = path.join("backups", dirName);

if (existsSync(outDir)) {
  console.error(`${outDir} already exists — refusing to overwrite a backup`);
  process.exit(1);
}
await mkdir(outDir, { recursive: true });

const tables = await topoSort(db, await listTables(db));
const migration = await currentMigration(db);

const counts = {};
let total = 0;

for (const table of tables) {
  const res = await db.execute(sql.raw(`SELECT * FROM ${quoteIdent(table)}`));
  const rows = res.rows;
  counts[table] = rows.length;
  total += rows.length;
  await writeFile(path.join(outDir, `${table}.json`), JSON.stringify(rows, null, 2) + "\n");
  console.log(`  ${String(rows.length).padStart(6)}  ${table}`);
}

const manifest = {
  takenAt: new Date().toISOString(),
  label,
  databaseHost: new URL(process.env.DATABASE_URL).host,
  migration,
  // Restore order. Reverse it to truncate.
  tableOrder: tables,
  rowCounts: counts,
  totalRows: total,
};
await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

console.log(`\n${total} rows across ${tables.length} tables → ${outDir}`);
