# Rollback — production deploy went wrong

## When to use this

`deploy-prod.yml` shipped a commit and production is now worse: the smoke
check failed, `/api/health` is 503, Sentry lit up, or Heidi says so.

## Prerequisites

- Vercel dashboard access (project `ai-teacher`, team `jaetill-5386s-projects`)
- GitHub access to `jaetill/ai-teacher`
- If the bad deploy included a migration: Neon console access

## Steps

### 1. Decide: code or schema?

`git log --oneline -5 origin/main` and look for `drizzle/` in the diff of the
deployed commit (`git show --stat <sha>`). No migration → step 2 only.
Migration → steps 2 and 3.

### 2. Roll the code back (≈1 minute, no commit needed)

Vercel → Project → **Deployments** → find the last good production deployment
(target = Production, status Ready, dated before the bad one) → **⋯ →
Promote to Production**. Traffic moves immediately.

Then stop the bleeding at the source so the next CI run doesn't re-ship it:

```
git revert <bad-sha>          # keeps history honest; never force-push main
git push origin main          # CI → deploy-prod ships the revert
```

### 3. Schema: migrations do not roll back

Drizzle migrations here are **forward-only** — there is no down file, and
`db:migrate` cannot un-apply. Two options, worst-first:

- **Column/table was ADDED** (the usual case): leave it. The reverted code
  ignores it. Write the follow-up fix forward.
- **Data was changed or something was DROPPED:** Neon → Branches → **Create
  branch** from `main` at a timestamp *before* the migration ran (Neon
  point-in-time restore). Verify on the branch, then either promote it or
  `npm run db:restore -- <dump> --confirm --replace --prod` from the
  pre-deploy backup you took (you did take one: `npm run db:backup`).
  Afterwards `drizzle.__drizzle_migrations` on prod will be *behind* the repo —
  delete the offending migration file and its journal entry before the next
  `db:generate`, or the migrator will try to re-apply it.

## Verification

- `curl -s https://ai-teacher-omega-sage.vercel.app/api/health` → `"ok":true`
  and `release` shows the promoted SHA.
- Sign in, open `/curriculum`, open the copilot, send one message.
- `select created_at, route, status, reason from error_events order by
  created_at desc limit 20;` — the rate of new rows should drop to the
  pre-incident baseline.

## Rollback of the rollback

Promote the newer deployment again from the same Vercel list. Nothing about
"Promote" is destructive.

## Escalation

Single operator. Vercel status: https://www.vercel-status.com. Neon:
https://neonstatus.com. If both are green and `/api/health` is still 503 the
`DATABASE_URL` in Vercel Production scope is wrong — see `database.md`.
