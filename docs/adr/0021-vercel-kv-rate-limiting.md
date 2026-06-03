# ADR-0021: Vercel KV for fleet-wide feedback rate limiting

- **Status:** Proposed
- **Date:** 2026-06-03
- **Deciders:** Jason
- **Tags:** dependency, api, rate-limiting, vercel, redis

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

The `POST /api/feedback` route rate-limits submissions to 10 per IP per hour. The original implementation used an in-memory `Map`, which meant each serverless instance tracked its own counter independently. On Vercel, where multiple instances can serve the same route concurrently, the effective ceiling multiplied by the number of warm instances — a single IP could submit far more than 10 requests per hour (issue #51).

Two decisions are coupled here: (1) which backing store to use for the shared counter, and (2) whether the resulting behavioral change to rate-limit enforcement needs to be called out as an API-contract change.

**Deprecation concern:** `@vercel/kv` v3.0.0 is already marked deprecated by Vercel. The npm registry metadata states: *"Vercel KV is deprecated. … For new projects, install a Redis integration from Vercel Marketplace."* The successor is `@upstash/redis` used directly. This ADR records the choice as-proposed while flagging the deprecation for immediate follow-up.

## Decision Drivers

- **Correctness.** The 10/hour rate limit must be enforced fleet-wide, not per-instance. This is a bug fix, not a new feature.
- **Minimal infrastructure delta.** The solution should not require provisioning or managing a self-hosted Redis cluster. Vercel-native integrations are preferred.
- **Dependency health.** New production dependencies should be actively maintained and not deprecated.
- **Deployment requirements.** New environment variables or infrastructure must be documented; missing config must not silently break the route.
- **API stability.** The HTTP contract (request/response shapes, status codes) should not change. Behavioral changes to enforcement strictness should be intentional and documented.

## Considered Options

### Sub-decision 1: Rate-limit backing store

- Option A: `@vercel/kv` — Vercel's KV wrapper around Upstash Redis
- Option B: `@upstash/redis` — Upstash Redis SDK directly (no Vercel wrapper)
- Option C: Vercel Edge Config — key-value store optimized for reads
- Option D: Database-backed counters (Neon/PostgreSQL via Drizzle)

### Sub-decision 2: API-contract classification

- Option A: Classify as api-contract change (behavioral change to enforcement)
- Option B: Classify as implementation-only (HTTP contract unchanged)

## Decision Outcome

We chose the bundle:

- Sub-decision 1 → **Option A (`@vercel/kv`)**, because it provides the simplest integration path with automatic environment variable binding on Vercel. However, this choice carries a deprecation risk that must be addressed in a follow-up migration to `@upstash/redis` (Option B).
- Sub-decision 2 → **Option A (api-contract change)**, because the rate-limit behavior observable to clients changes materially: limits are now strictly enforced fleet-wide rather than per-instance. Additionally, two new environment variables (`KV_REST_API_URL`, `KV_REST_API_TOKEN`) become runtime requirements.

The bundle is internally consistent because the backing-store choice directly determines the behavioral change and the new infrastructure requirements that make this an api-contract concern.

## Consequences

### Positive

- **Bug fix delivered.** Rate limiting is now fleet-wide. A single IP is correctly capped at 10 submissions per hour regardless of how many serverless instances serve the route.
- **Atomic window management.** Redis `INCR` + `EXPIRE` replaces the manual timestamp-based windowing and the 10,000-entry eviction heuristic in the old `Map`. Simpler, correct under concurrency.
- **No HTTP contract change.** Request/response shapes and status codes remain identical. Existing clients (the feedback form) require zero changes.
- **Test coverage added.** A new test validates the 11th request returns 429 with a `Retry-After` header, using a shared mock KV store that simulates fleet-wide behavior.

### Negative

- **Deprecated dependency.** `@vercel/kv` v3.0.0 is deprecated by Vercel. While it works today (it wraps `@upstash/redis` ^1.34.0 internally), it will receive no further updates. A migration to `@upstash/redis` directly should be scheduled promptly.
- **New infrastructure requirement.** The route now requires a provisioned Vercel KV (Upstash Redis) store and two environment variables. If these are missing, the route will throw on the first request rather than degrading gracefully.
- **External network call on every request.** Each feedback submission now makes 1–2 Redis round-trips (INCR, and conditionally EXPIRE or TTL) before the GitHub API call. Adds ~5–15 ms latency per request. Acceptable for a low-traffic feedback endpoint.
- **3 transitive dependencies added.** `@vercel/kv` → `@upstash/redis` → `uncrypto`. Small surface area, but increases supply-chain exposure.

### Neutral

- **Rate-limit behavior is stricter for clients.** Previously, a client could exceed 10/hour if requests hit different instances. Now the limit is absolute. This is the intended fix, not a regression, but clients that previously "got lucky" will see 429s they didn't before.
- **No graceful degradation path.** The old in-memory approach worked without any external service. The new approach hard-depends on KV. A future enhancement could fall back to permissive behavior when KV is unreachable, but that trades correctness for availability on a non-critical endpoint.

## Pros and Cons of the Options

### Sub-decision 1: Rate-limit backing store

| Option | Pros | Cons |
|---|---|---|
| **A: `@vercel/kv`** (chosen) | Simplest Vercel integration; auto-binds env vars; thin wrapper | **Deprecated** — no further updates; adds an abstraction layer over `@upstash/redis` |
| **B: `@upstash/redis`** | Actively maintained; same underlying SDK; direct access to full Redis API | Slightly more setup (manual env var names); no Vercel-specific convenience |
| **C: Vercel Edge Config** | Ultra-low latency reads; Vercel-native | Designed for config, not counters; no atomic increment; read-optimized, write-limited |
| **D: Neon/PostgreSQL** | Already in the stack (Drizzle); no new dependency | Overkill for simple counters; adds DB load; more complex query for INCR+EXPIRE semantics |

### Sub-decision 2: API-contract classification

| Option | Pros | Cons |
|---|---|---|
| **A: api-contract** (chosen) | Accurately flags the behavioral change and new env var requirements; forces deployment review | Slightly overstates impact — the HTTP contract itself is unchanged |
| **B: implementation-only** | Technically correct that request/response shapes don't change | Misses the new infrastructure dependency and the observable behavioral change in enforcement strictness |

## Implementation notes

- **Route changed:** `src/app/api/feedback/route.ts` — `checkRateLimit()` converted from synchronous in-memory to async Vercel KV. The `POST` handler now `await`s the rate-limit check.
- **New env vars required (Vercel dashboard):** `KV_REST_API_URL`, `KV_REST_API_TOKEN` — provisioned by adding a KV store in the Vercel dashboard.
- **Test updated:** `tests/api/feedback.test.ts` — mocks `@vercel/kv` with a shared `Map` simulating fleet-wide state. New test case validates the 11th request returns 429.
- **Follow-up required:** Migrate from `@vercel/kv` to `@upstash/redis` before the deprecated package stops receiving security patches. The migration is mechanical — replace `import { kv } from "@vercel/kv"` with direct Upstash Redis client construction. Env var names will change from `KV_REST_API_*` to `UPSTASH_REDIS_REST_*`.

## Links

- [Vercel KV deprecation notice](https://vercel.com/changelog/vercel-kv-is-now-deprecated) — official deprecation announcement.
- [Upstash Redis SDK](https://github.com/upstash/redis-js) — the successor package.
- [ADR-0012](0012-user-feedback.md) — established the feedback API route.
- Issue #51 — reported the per-instance rate-limit bypass.
