# Database — environments, migrations, backup, restore, reset

## When to use this

Any time you touch the Neon database from a laptop: setting up a dev branch,
applying a migration, taking or restoring a backup, or wiping curriculum for a
reimport.

## The rule

**Production data lives on one Neon endpoint (`ep-icy-morning-antemsbt…`), and
nothing on a laptop points at it by default.** Local `.env.local` uses the
`vercel-dev` branch; Vercel Previews get a per-PR branch from the Neon
integration. `scripts/lib/db-tools.mjs`
refuses `db:reset` and `db:restore` against the production host unless you pass
`--prod`.

Before 2026-09-01 the laptop `.env.local` pointed at production (handoff
2026-06-28: "serves BOTH local and prod"). Previews were already isolated by
the integration; the 2026-09-01 readiness report was wrong to say otherwise.

## Prerequisites

- Neon console access: https://console.neon.tech → project for ai-teacher
- Vercel dashboard access for the project
- Node 22, repo cloned, `npm i` done

## Steps

### 1. Vercel previews — already handled (Neon↔Vercel integration)

The Neon Vercel integration is installed on this project. It creates a Neon
branch `preview/<git-branch>` for every PR and injects its `DATABASE_URL` /
`DATABASE_URL_UNPOOLED` into that Preview deployment. Nothing to configure.

Housekeeping: it does **not** reliably delete those branches when the PR
merges, and the free plan caps the project at 10 branches. When you hit
"Branch limit reached", Neon → Branches → ⋮ → Delete on every `preview/*`
whose PR is closed.

### 2. Laptop — point `.env.local` at `vercel-dev`, never at production

The integration also created a `vercel-dev` branch. That is your local
database:

1. Neon → Branches → `vercel-dev` → **Connect** → copy the connection string.
2. `.env.local` → `DATABASE_URL` = that string. (`cp .env.example .env.local`
   if starting fresh.)
3. `npm run db:reset -- --dry-run` must print a host that is **not**
   `ep-icy-morning-antemsbt`.

Vercel → Settings → Environment Variables: `DATABASE_URL` should be scoped to
**Production** only. The integration owns Preview.

### 3. Refresh a dev branch from prod (whenever you want current data)

Neon → Branches → `vercel-dev` → **Reset from parent**. Seconds; no app change.

### 4. Apply migrations

```
npm run db:generate          # after editing src/db/schema/*.ts — never hand-write SQL
npm run db:migrate           # applies pending files in drizzle/ to $DATABASE_URL
```

`db:migrate` is journal-tracked (`drizzle.__drizzle_migrations`) and safe to
re-run. Apply to `vercel-dev` first, then run against production by temporarily
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
returns 500s on every DB route; `GET /api/health` returns 503 `{ ok: false }`.
