# ADR-0046: Postgres-backed distributed rate limit for the feedback endpoint

- **Status:** Accepted
- **Date:** 2026-06-28
- **Deciders:** Jason
- **Ratified:** 2026-06-28 (Jason chose Postgres over Upstash/Vercel KV to avoid a new vendor; supersedes the closed PR #502, which proposed the now-deprecated Vercel KV)
- **Tags:** security, infrastructure, rate-limiting

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled.

## Context and Problem Statement

`POST /api/feedback` files a GitHub issue for every submission (the in-app feedback widget). Its abuse guard was an in-memory `Map` rate limit (10/hour per IP). On Vercel's serverless runtime each warm instance has its own memory, so the limit was effectively per-instance — the real cap was N × 10/hour, and a determined submitter hitting different instances could flood the issue tracker (#48).

The guard needs **shared state across instances**. Which mechanism should back it, and is a new external dependency justified for a single endpoint on a low-traffic, invite-only app?

## Decision Drivers

- **Correctness across instances.** The limit must be global, not per-warm-instance.
- **Solo-developer cost & vendor discipline.** Avoid adding a paid service or a new vendor relationship for one endpoint if existing infrastructure suffices.
- **Operational simplicity.** Fewer credentials, dashboards, and integrations to manage and to fail.
- **Atomicity.** The check must be race-free under concurrent requests (no read-then-write window).
- **Scale reality.** Traffic is low (single-tenant / invite-only). Microsecond-latency KV is not required; a single indexed DB write per submission is fine.

## Considered Options

- **Option A: Vercel KV (`@vercel/kv`)**
- **Option B: Upstash Redis (`@upstash/redis`)**
- **Option C: Postgres counter on the existing Neon database**
- **Option D: Keep the in-memory limiter (document as best-effort)**

## Decision Outcome

Chosen option: **Option C — a Postgres counter on the existing Neon database.** It makes the limit correct and global, adds **no new vendor, dependency, or paid service**, reuses infrastructure and credentials the app already has, and the rate-limit check is a single atomic `INSERT … ON CONFLICT DO UPDATE … RETURNING` upsert (race-free in one round-trip). At this app's traffic, one extra indexed write per feedback submission is negligible.

**Option A is rejected as non-viable:** Vercel KV was sunset in December 2024; existing stores were migrated to Upstash and `@vercel/kv` is deprecated. New projects must provision a Redis integration from the Vercel Marketplace. The original PR #502 predated this and is superseded.

**Option B (Upstash Redis) is the strongest alternative** and the canonical Redis path on Vercel today, but it introduces a new vendor, account, Marketplace integration, and credential pair (`UPSTASH_REDIS_REST_URL`/`TOKEN`) for a single rarely-hit endpoint — cost/complexity the Neon counter avoids.

## Consequences

### Positive

- **Globally correct limit.** All instances share one counter; the 10/hour cap actually holds.
- **No new vendor or paid tier.** Reuses Neon + the existing `DATABASE_URL`; nothing new to provision, bill, or rotate.
- **Race-free.** A single atomic upsert with `RETURNING` — no read-modify-write window.

### Negative

- **One DB write per feedback submission.** Acceptable at this app's volume; the feedback endpoint is low-frequency by nature.
- **`rate_limits` rows accumulate** (one per distinct IP). Tiny, but unbounded without cleanup — see Implementation notes for the mitigation.

### Neutral

- **Reusing the app DB for rate limiting couples a security control to the primary datastore.** Fine here; if a future, higher-traffic endpoint needs sub-millisecond limiting, revisit Option B at that point (the `checkRateLimit` helper is the only thing that would change).

## Pros and Cons of the Options

### Option A: Vercel KV (`@vercel/kv`)

- ❌ Con: **Deprecated / sunset (Dec 2024).** Not available for new projects; `@vercel/kv` is no longer the supported path. Disqualifying.

### Option B: Upstash Redis (`@upstash/redis`)

- ✅ Pro: Purpose-built; atomic `INCR`/`EXPIRE`; generous free tier; sub-ms latency.
- ✅ Pro: The canonical Redis option on Vercel now (via Marketplace).
- ❌ Con: New vendor, account, Marketplace integration, and credential pair to manage — for one low-traffic endpoint.
- ❌ Con: Another external service in the request path that can fail or rate-limit independently.

### Option C: Postgres counter on Neon (chosen)

- ✅ Pro: No new dependency, vendor, or paid service; reuses existing DB + credentials.
- ✅ Pro: Atomic single-statement upsert (`ON CONFLICT DO UPDATE … RETURNING`) — race-free.
- ✅ Pro: One fewer thing to provision and monitor.
- ❌ Con: A DB write per submission and accumulating rows (both negligible / mitigable at this scale).

### Option D: Keep in-memory limiter

- ✅ Pro: Zero work, zero infrastructure.
- ❌ Con: Doesn't fix the bug — the limit stays per-instance and ineffective on Vercel (#48).

## Implementation notes

- **Schema:** `src/db/schema/rate-limits.ts` — `rate_limits(key text PK, count int not null default 0, window_start timestamptz not null default now())`. Migration `drizzle/0010_rate_limits.sql`; applied to the live Neon DB via direct SQL (push-managed; the repo's migration journal is ahead of its snapshots, so `db:migrate` is intentionally not run).
- **Logic:** `src/app/api/feedback/route.ts` `checkRateLimit(ip)` — `db.insert(rateLimits).values({key, count:1}).onConflictDoUpdate({ count: CASE WHEN window expired THEN 1 ELSE count+1, window_start: CASE WHEN expired THEN now() ELSE window_start }).returning()`. Rejects (429 + `Retry-After`) when the returned count exceeds the 10/hour cap.
- **Row growth:** acceptable at current scale. A future cleanup (cron `DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'`, or a TTL job) can be added if the table grows; not needed now.

## Links

- [Issue #48](https://github.com/jaetill/ai-teacher/issues/48) — the per-instance limiter bug this closes.
- [PR #502](https://github.com/jaetill/ai-teacher/pull/502) — the superseded Vercel KV proposal.
- [Vercel: Redis on Vercel](https://vercel.com/docs/redis) — documents the Vercel KV sunset / Marketplace (Upstash) path.
