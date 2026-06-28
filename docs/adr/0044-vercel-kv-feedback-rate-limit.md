# ADR-0044: Vercel KV for distributed feedback rate limiting

- **Status:** Proposed
- **Date:** 2026-06-28
- **Deciders:** Jason
- **Tags:** new-external-dep, rate-limiting, vercel-kv, feedback

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled.

## Context and Problem Statement

ADR-0012 §4 specified per-IP rate limiting (10 req/hr) for the `/api/feedback` endpoint. The initial implementation used an in-memory `Map` scoped to a single Vercel serverless instance. Under load, Vercel spins up multiple concurrent instances, each starting with an empty map. An attacker sending requests across instances bypasses the rate limit entirely because each instance tracks its own counter independently.

Which shared-state mechanism should back the distributed rate limit, and is the new external dependency (`@vercel/kv`) justified?

## Decision Drivers

- **Correctness of ADR-0012 §4.** The rate limit was specified as per-IP; the in-memory implementation violated that contract under multi-instance conditions.
- **Solo developer cost discipline.** Vercel KV has a free tier (256 MB, 30K daily commands) that covers this use case indefinitely at current traffic levels.
- **Operational simplicity.** The solution should be trivial to provision and require no self-managed infrastructure.
- **Fail-open safety.** Dev, CI, and transient-error scenarios must not block legitimate feedback submissions.
- **Vercel-native stack.** The project is deployed on Vercel (per CLAUDE.md); a Vercel-native service avoids cross-vendor networking and auth complexity.

## Considered Options

- **Option A: Vercel KV (`@vercel/kv`)**
- **Option B: Upstash Redis (`@upstash/redis`)**
- **Option C: Database-backed counter (Neon/PostgreSQL)**
- **Option D: Vercel Edge Config**

## Decision Outcome

Chosen option: **Option A — Vercel KV**, because it is the Vercel-native Redis-compatible KV store, requires zero infrastructure beyond dashboard provisioning, has a free tier that covers the use case, and maps directly to the atomic `INCR` + `EXPIRE` pattern that rate limiting requires. The `@vercel/kv` SDK is a thin wrapper (~15 KB) around Vercel's managed Redis endpoint.

## Consequences

### Positive

- Rate limit is now globally enforced across all Vercel instances, closing the multi-instance bypass described in ADR-0012 §4.
- Atomic `INCR` + `EXPIRE` pattern means no race conditions between concurrent requests — Redis handles serialization.
- Fail-open design: missing env vars log a warning and allow the request; transient KV errors are caught and allow the request. No degradation of the feedback form.
- Free tier (256 MB, 30K daily commands) is sufficient for rate-limit counters at current and foreseeable traffic volumes.

### Negative

- **New external dependency.** `@vercel/kv` (v3.0.0) is added to `dependencies`. It is maintained by Vercel and tightly coupled to the hosting platform, which limits portability.
- **New environment variables.** `KV_REST_API_URL` and `KV_REST_API_TOKEN` must be provisioned in the Vercel dashboard. Until provisioned, the rate limit falls back to fail-open (no enforcement).
- **Vendor coupling.** Choosing a Vercel-specific KV store deepens the Vercel lock-in. If the project migrates off Vercel, this dependency must be swapped.

### Neutral

- The `@vercel/kv` package is built on Upstash Redis under the hood. Migrating to `@upstash/redis` directly would be a near-drop-in replacement if Vercel KV is deprecated or if the project moves off Vercel.
- The in-memory `Map` implementation is fully removed, not retained as a fallback. The fail-open path (when KV is unconfigured) allows all requests rather than applying a per-instance limit.

## Pros and Cons of the Options

### Option A: Vercel KV (`@vercel/kv`)

- Pro: Vercel-native — provisioned via dashboard, env vars auto-injected, zero networking setup.
- Pro: Free tier covers the use case; no cost at current scale.
- Pro: Redis-compatible `INCR`/`EXPIRE` is the canonical rate-limit pattern — correct by construction.
- Pro: Thin SDK (~15 KB); minimal bundle impact.
- Con: Vercel-specific; deepens platform coupling.
- Con: New external dependency to track for security updates.

### Option B: Upstash Redis (`@upstash/redis`)

- Pro: Platform-agnostic — works on any hosting provider.
- Pro: Same `INCR`/`EXPIRE` pattern; Vercel KV is built on Upstash.
- Con: Requires separate Upstash account and credential management.
- Con: Extra vendor relationship when Vercel KV provides the same service natively.

### Option C: Database-backed counter (Neon/PostgreSQL)

- Pro: Reuses existing database infrastructure (Neon, per CLAUDE.md).
- Pro: No new dependency — `drizzle-orm` already in the project.
- Con: SQL `INSERT ... ON CONFLICT UPDATE` + `SELECT` is not atomic without advisory locks or CTEs; race conditions possible.
- Con: Higher latency per request than Redis `INCR` (~5ms vs ~1ms).
- Con: Pollutes the application database with ephemeral rate-limit rows.

### Option D: Vercel Edge Config

- Pro: Vercel-native; ultra-low-latency reads.
- Con: Designed for read-heavy config, not write-heavy counters. Writes are async and eventually consistent — unsuitable for rate limiting.
- Con: No atomic increment primitive.

## Implementation notes

- Dependency: `@vercel/kv@^3.0.0` added to `package.json`.
- Route: `src/app/api/feedback/route.ts` — `checkRateLimit()` changed from synchronous in-memory to async KV-backed.
- KV key pattern: `rl:fb:{ip}` with TTL of 3600 seconds (1 hour window).
- Provisioning: create a KV store in the Vercel dashboard and link it to the `ai-teacher` project. `KV_REST_API_URL` and `KV_REST_API_TOKEN` are injected automatically once linked.
- Tests: 4 new test cases in `tests/api/feedback.test.ts` covering within-limit, over-limit, EXPIRE-skip, and fail-open scenarios.

## Links

- [Vercel KV documentation](https://vercel.com/docs/storage/vercel-kv)
- [Upstash Redis (underlying provider)](https://upstash.com/)
- [ADR-0012](0012-user-feedback.md) — User Feedback decision; §4 specifies per-IP rate limiting.
- [MADR 4.x](https://adr.github.io/madr/) — ADR format used.
