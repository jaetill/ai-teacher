# Database — environments, migrations, backup, restore, reset

## When to use this

Any time you touch the Neon database from a laptop: setting up a dev branch,
applying a migration, taking or restoring a backup, or wiping curriculum for a
reimport.

## The rule

**Production data lives on one Neon endpoint (`ep-icy-morning-antemsbt…`), and
nothing on a laptop points at it by default.** Local `.env.local` and Vercel
Preview each point at their own Neon branch. `scripts/lib/db-tools.mjs`
refuses `db:reset` and `db:restore` against the production host unless you pass
`--prod`.

Before 2026-09-01 local, preview, and prod all shared the production endpoint
(handoff 2026-06-28: "serves BOTH local and prod"). That is what this runbook
fixes.

## Prerequisites

- Neon console access: https://console.neon.tech → project for ai-teacher
- Vercel dashboard access for the project
- Node 22, repo cloned, `npm i` done

## Steps

### 1. One-time: create the branches (Neon console)

1. Neon → Branches → **Create branch** from `main` (production).
   Name: `dev`. Data: *include data* (a copy of prod is the most useful dev
   fixture; it is a copy-on-write snapshot, effectively free).
2. Repeat for `preview` — this is what Vercel PR previews will use.
3. For each branch, copy its connection string (pooled is fine for the app;
   direct is fine for scripts — both work over the HTTP driver).

### 2. One-time: point each environment at its branch

- **Laptop:** `.env.local` → `DATABASE_URL` = the `dev` branch string.
  (`cp .env.example .env.local` if starting fresh.)
- **Vercel Preview:** Settings → Environment Variables → `DATABASE_URL`,
  scope **Preview only** → the `preview` branch string.
- **Vercel Production:** `DATABASE_URL`, scope **Production only** → the
  production string. Remove any Preview/Development scoping from it.
- Redeploy the latest preview to pick up the change.

### 3. Refresh a dev branch from prod (whenever you want current data)

Neon → Branches → `dev` → **Reset from parent**. Seconds; no app change.

### 4. Apply migrations

```
npm run db:generate          # after editing src/db/schema/*.ts — never hand-write SQL
npm run db:migrate           # applies pending files in drizzle/ to $DATABASE_URL
```

`db:migrate` is journal-tracked (`drizzle.__drizzle_migrations`) and safe to
re-run. Apply to `dev` first, then run against production by temporarily
exporting the prod URL in the shell (not by editing `.env.local`):

```
DATABASE_URL="<prod string>" npm run db:migrate
```

Migrations are forward-only. There is no down path — see `rollback.md`.

### 5. Backup

```
npm run db:backup -- --label before-something
```

Writes `backups/<timestamp>_<label>/` (gitignored) with one JSON per table and
a manifest recording host, migration hash, row counts. Works against any host;
not guarded, because reading is harmless.

Neon also keeps point-in-time history on every branch (check the project's
retention window under Settings → History; on the free plan it is short). A
Neon branch created *from a timestamp* is the fastest full restore of
production — prefer it over the JSON path for anything structural.

### 6. Restore

```
npm run db:restore -- backups/<dir> --dry-run
npm run db:restore -- backups/<dir> --confirm [--replace] [--force] [--prod]
```

Refuses non-empty tables without `--replace`, refuses a migration-hash mismatch
without `--force`, refuses the production host without `--prod`.

### 7. Reset (wipe curriculum for reimport)

```
npm run db:reset -- --dry-run
npm run db:reset -- --confirm            # keeps standards/templates/years/terms/glossary
npm run db:reset -- --confirm --all      # wipes reference data too
```

Refuses the production host without `--prod`. `scripts/Reset-Db.ps1` wraps
this and additionally requires a backup to exist.

## Verification

- `node -e "import('./scripts/lib/db-tools.mjs').then(m=>console.log(m.isProdHost(process.env.DATABASE_URL)))"`
  after `set -a; . .env.local` prints `false` on a laptop.
- `npm run db:reset -- --dry-run` prints `Host: ep-…` — confirm it is the branch,
  not `ep-icy-morning-antemsbt`.
- Vercel → Deployments → a preview deployment's env shows the preview branch host.

## Rollback

- Wrong branch wired to an environment: fix the env var, redeploy. No data moved.
- Ran a destructive script against prod anyway (you passed `--prod`): Neon →
  Branches → create branch from `main` at the timestamp just before the run,
  then either promote it or `db:restore` from it. Then read `rollback.md`.

## Escalation

Single operator. If Neon itself is down: https://neonstatus.com. The app
returns 500s on every DB route; `GET /api/health` reports `db: false`.
