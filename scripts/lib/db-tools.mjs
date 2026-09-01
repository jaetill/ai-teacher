// Shared plumbing for the db-backup / db-restore / db-reset scripts.
//
// All three talk to Neon over the HTTP driver for the same reason
// scripts/db-migrate.mjs does: it is the transport the app itself uses, so if
// the app can reach the database, so can these scripts. Websocket-based
// tooling (drizzle-kit, psql, pg_dump) has been observed to silently no-op on
// Jason's network.
//
// No pg_dump dependency by design — these scripts run anywhere Node runs.
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import { config } from "dotenv";

// Tables that hold seeded reference data or tooling state rather than the
// teacher's imported curriculum. `db-reset` leaves these alone by default so a
// wipe/reimport round-trip does not force a standards reseed.
export const REFERENCE_TABLES = [
  "standards",
  "lesson_templates",
  "school_years",
  "terms",
  "glossary_terms",
  "__drizzle_migrations",
];

// Neon endpoints that hold the teacher's live data. Destructive scripts refuse
// to run against these unless --prod is passed explicitly. Host names are not
// secrets; the point is that a laptop `.env.local` accidentally still pointing
// at prod cannot truncate it by muscle memory. Dev work belongs on a Neon
// branch (see docs/runbooks/database.md).
export const PROD_DB_HOST_PATTERNS = [/^ep-icy-morning-antemsbt\b/];

export function isProdHost(url) {
  try {
    const host = new URL(url).host;
    return PROD_DB_HOST_PATTERNS.some((re) => re.test(host));
  } catch {
    return false;
  }
}

/**
 * @param {{destructive?: boolean}} [opts]  `destructive: true` makes the call
 *   refuse a production host unless `--prod` is on argv.
 */
export function connect(opts = {}) {
  config({ path: ".env.local" });
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set (checked .env.local and environment)");
    process.exit(1);
  }
  if (opts.destructive && isProdHost(url) && !process.argv.includes("--prod")) {
    console.error(
      `REFUSING: ${new URL(url).host} is the PRODUCTION database.\n` +
        "This script destroys data. Point .env.local at a Neon dev branch, or pass\n" +
        "--prod if you really mean production (take a backup first: npm run db:backup).",
    );
    process.exit(1);
  }
  return drizzle(neon(url));
}

/** Every base table in the public schema, alphabetically. */
export async function listTables(db) {
  const res = await db.execute(
    sql`SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name`,
  );
  return res.rows.map((r) => r.table_name);
}

/**
 * Order tables so that a table always appears after everything it references.
 * Restores must insert in this order; truncates must run in reverse.
 * Self-references are ignored (a row can point at a sibling in the same table).
 */
export async function topoSort(db, tables) {
  const res = await db.execute(
    sql`SELECT tc.table_name AS child, ccu.table_name AS parent
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
         AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public'`,
  );

  const known = new Set(tables);
  const deps = new Map(tables.map((t) => [t, new Set()]));
  for (const { child, parent } of res.rows) {
    if (child === parent) continue; // self-reference: not an ordering constraint
    if (known.has(child) && known.has(parent)) deps.get(child).add(parent);
  }

  const ordered = [];
  const placed = new Set();
  // Alphabetical within a tier keeps the output stable and diffable.
  const remaining = [...tables].sort();
  while (remaining.length) {
    const ready = remaining.filter((t) => [...deps.get(t)].every((p) => placed.has(p)));
    if (!ready.length) {
      // A cycle. Emit the rest as-is rather than failing; Postgres will tell
      // us if it actually matters.
      ordered.push(...remaining);
      break;
    }
    for (const t of ready) {
      ordered.push(t);
      placed.add(t);
      remaining.splice(remaining.indexOf(t), 1);
    }
  }
  return ordered;
}

/** The migration this database is currently at, so a dump records its shape. */
export async function currentMigration(db) {
  try {
    const res = await db.execute(
      sql`SELECT hash, created_at FROM drizzle.__drizzle_migrations
          ORDER BY created_at DESC LIMIT 1`,
    );
    return res.rows[0] ?? null;
  } catch {
    return null;
  }
}

export function quoteIdent(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(name)) {
    throw new Error(`refusing to build SQL with suspicious identifier: ${name}`);
  }
  return `"${name}"`;
}

export function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
