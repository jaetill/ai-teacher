# AI billing — credits ran out, or the key was rejected

## When to use this

You got a Sentry email titled **"ACTION NEEDED: Anthropic credits exhausted…"**
or **"…Anthropic rejected ANTHROPIC_API_KEY…"**, or a teacher reports the
copilot saying "prepaid credits have run out".

## Background (decided 2026-09-03)

`ANTHROPIC_API_KEY` belongs to Jason's **hotmail** Anthropic org
(`8a0c287a-e45c-4b2b-93a0-8d705c58f3fe`), funded by a one-time $10 in April
2026. The Claude subscription and the intended long-term home are the
**jaetill@gmail.com** org (`8d63eee8-8b9c-4060-bca6-ee5fac4d7c60`). The
decision was to ride the hotmail credit until it runs out — Anthropic has no
balance API, so the first signal is the failed call. `src/lib/anthropic-failure.ts`
recognises it, `error_events.reason` becomes `ai_billing_exhausted` /
`ai_key_invalid`, and Sentry gets one `fatal` issue per kind with the fix in the
title. Every AI route returns 503 with a plain sentence; the copilot says it
in-stream. No teacher data is at risk; only AI features pause.

## Early warning (the $1 line)

`.github/workflows/ai-credit-watch.yml` runs daily and **fails on purpose** when
the estimate in `scripts/ai-credit-estimate.mjs` drops below
`alertBelowUsd` in `scripts/ai-credit-baseline.json` — GitHub's failure email is
the notification. The estimate = the balance a human last read off the console
(`usd` / `at` in the baseline file) minus every call recorded since, at list
prices, rounded against us. Run it yourself any time: `npm run ai:credit`.

**Whenever you read the real balance or top up, update `usd` and `at` in the
baseline file** — otherwise the estimate drifts. When you move to the jaetill
org, update `org` too.

## Prerequisites

- Console access as jaetill@gmail.com: https://platform.claude.com
- Vercel dashboard access
- This repo checked out

## Steps

1. **Confirm which it is.**
   ```sql
   select created_at, route, reason, detail from error_events
   where reason in ('ai_billing_exhausted','ai_key_invalid')
   order by created_at desc limit 5;
   ```
2. **Mint the replacement key in the jaetill org.** Console → make sure the
   org switcher (bottom-left) shows the `8d63eee8…` org → API keys → Create →
   name `ai-teacher-prod`. Copy it once; it is not shown again.
3. **Fund it.** Console → Credits → Add funds. $10–20 is the historical burn
   for months of use; `ai_interactions` will now tell you the real rate:
   ```sql
   select date_trunc('week', created_at) wk, sum(token_count_in) tin,
          sum(token_count_out) tout, sum(cache_read_tokens) cached
   from ai_interactions group by 1 order by 1 desc limit 8;
   ```
4. **Swap the key.** Vercel → ai-teacher → Settings → Environment Variables →
   `ANTHROPIC_API_KEY` → Edit → paste → Save (All Environments). Then Actions →
   deploy-prod → **Run workflow** (env changes need a redeploy).
5. **Laptop:** replace `ANTHROPIC_API_KEY` in `.env.local`.
6. **Revoke the old key** in the hotmail console (API keys → …`HAAA` → Revoke)
   so nothing can quietly keep billing a dead org. Optionally delete that org.
7. **Update this runbook and CLAUDE.md**: the "Background" section above is now
   history; the key lives in the jaetill org.

## Verification

- `curl -s https://ai-teacher-omega-sage.vercel.app/api/health` → `ok:true`.
- Sign in, send one copilot message, get a reply.
- The Sentry issue stops receiving events; resolve it.
- jaetill console → Cost → shows today's usage. The hotmail console shows none.

## Rollback

Paste the old key back into Vercel and redeploy — only useful if the old org
was refunded, which it won't be. Realistically: forward-only.

## Escalation

Single operator. If the jaetill org also rejects the key, Console → Settings
→ Billing; a card on file with usage credits enabled is the durable fix.
