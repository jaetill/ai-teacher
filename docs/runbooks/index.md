# Runbooks — ai-teacher

Operational playbooks. Format spec in [README.md](README.md).

## Current runbooks

- [`triage.md`](triage.md) — a user saw an error / an alert fired. Start here.
  `error_events` first, Sentry second.
- [`rollback.md`](rollback.md) — Vercel "Promote to Production" + the
  forward-only-migrations rule + Neon point-in-time branch.
- [`database.md`](database.md) — Neon branches per environment, migrate,
  backup, restore, reset, and the production-host guard on destructive scripts.

## Deploy (no runbook needed)

Push to `main` → `CI` workflow → on success, `deploy-prod.yml` runs
`vercel deploy --prod` behind the GitHub `production` Environment and polls
`/api/health` (ADR-0043). Vercel git auto-deploy for `main` is off
(`vercel.json`); PR previews are unaffected. Manual re-deploy of `main`:
Actions → deploy-prod → Run workflow.

## Planned (gaps to close)

- `secret-rotation.md` — rotate `ANTHROPIC_API_KEY`, Google OAuth secret,
  `NEXTAUTH_SECRET`, `VERCEL_TOKEN` when one is exposed.
- `sentry-alerts.md` — once an alert rule exists, what each one means.
