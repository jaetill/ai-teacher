# ADR-0051: AI usage accounting columns and token-weighted rate budget

- **Status:** Proposed
- **Date:** 2026-09-03
- **Deciders:** Jason
- **Tags:** schema, rate-limiting, observability

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

The `ai_interactions` table has existed since early schema work but was never written to — every Anthropic call completed without recording what it cost. The per-user rate limit (`AI_RATE_LIMIT_PER_HOUR`, default 40 calls) treats a 300-token classify and a 250k-token copilot turn with five PDFs as equal spend. Meanwhile the copilot re-sends tens of thousands of system-prompt tokens at full price on every turn because the prompt is passed as a plain string rather than a cache-eligible content block.

How should the app (a) record per-call usage so cost is queryable, (b) enforce a token-weighted budget alongside the existing per-call limit, and (c) reduce per-turn cost via prompt caching?

## Decision Drivers

- **Cost visibility.** "What did this week cost, and which route spent it?" must be answerable with a single SQL query against existing infrastructure — no external analytics vendor.
- **Fair budgeting.** A user who hits the copilot with large contexts should exhaust her budget faster than one who runs lightweight classifies, even if both make the same number of calls.
- **Never break the request.** Usage recording and budget charging happen *after* the call succeeds. A logging or charging failure must never turn a successful response into an error.
- **No new infra.** Reuse `ai_interactions` (Postgres) and `rate_limits` (existing windowed-counter table) — consistent with ADR-0046 and ADR-0050.
- **Enforceability.** It must be structurally hard for a future route to call Anthropic without recording usage.

## Considered Options

- Sub-decision 1: Where to record per-call usage
- Sub-decision 2: How to enforce a token-weighted budget
- Sub-decision 3: How to reduce repeated system-prompt cost on the copilot

## Decision Outcome

We chose the bundle:

- Sub-decision 1 → **Extend `ai_interactions` with cache-token + attribution columns**
- Sub-decision 2 → **A second windowed counter in `rate_limits`, charged post-call**
- Sub-decision 3 → **Content-block system prompt with `cache_control: { type: "ephemeral" }`**

The bundle is internally consistent because recording real `usage` from every call (sub-decision 1) feeds the numbers that the token budget charges (sub-decision 2), and prompt caching (sub-decision 3) changes the ratio of `cache_read_input_tokens` to `input_tokens` in that usage — all three reference the same `Anthropic.Messages.Usage` object.

## Consequences

### Positive

- **Cost is queryable.** `SELECT route, model, count(*), sum(token_count_in), sum(token_count_out), sum(cache_read_tokens) FROM ai_interactions WHERE created_at > now() - interval '7 days' GROUP BY 1,2 ORDER BY 4 DESC` answers the cost question.
- **Token-weighted fairness.** A heavy copilot turn charges ~250k billable tokens against the 2M/hour default; a classify charges ~300. The old per-call limit could not distinguish these.
- **Copilot turns 2..n read the system prompt from cache at ~10% cost.** The base prompt + curriculum block is tens of thousands of tokens and identical across turns — caching it is a significant per-conversation saving.
- **Ratchet test prevents drift.** `tests/lib/ai-usage.test.ts` walks every `route.ts` under `src/app/api/` and fails the build if a file that calls `getAnthropic()` does not also call `recordAiUsage` or `chargeAiTokens`.

### Negative

- **One overshoot per window.** The token budget is charged *after* the call, so a single request can push the counter past the limit. The next request is refused. This is the accepted trade for not paying a `countTokens` round-trip before every call.
- **Four new nullable columns on `ai_interactions`.** All are `ALTER TABLE … ADD COLUMN` with no default and no `NOT NULL` — online-safe, but pre-existing rows (if any existed) would have nulls. Since the table was previously unwritten, there are no pre-existing rows.

### Neutral

- **Copilot writes usage to `copilot_messages.token_count_*` rather than `ai_interactions`.** The copilot already has its own message table with token columns; duplicating into `ai_interactions` would mean two sources of truth. Both paths charge the same token budget via `chargeAiTokens`.
- **`billableTokens` weighting is approximate.** Cache reads at 10% and cache writes at 125% of input price. If Anthropic changes pricing, one constant changes — not the schema.

## Pros and Cons of the Options

### Sub-decision 1: Where to record per-call usage

| Option | Pros | Cons |
|---|---|---|
| **A: Extend `ai_interactions`** (chosen) | Table already exists; no new migration for the table itself; indexes already cover `entity_type`+`entity_id` and `created_at`. | Four new columns; `owner_email` duplicates session info (but needed for the per-owner cost query without joining). |
| **B: New `ai_usage_log` table** | Clean slate; no nullable backfill concern. | Adds a table that duplicates `ai_interactions`' purpose; two places to query cost; migration for a table that already exists. |
| **C: Structured console logging** | No schema change. | Same retention and queryability limits as rejected in ADR-0050 Option B. |

### Sub-decision 2: How to enforce a token-weighted budget

| Option | Pros | Cons |
|---|---|---|
| **A: Second windowed counter in `rate_limits`** (chosen) | Reuses the existing `rate_limits` table and `bumpCounter` upsert — one round-trip to charge. Read-only peek at check time avoids incrementing on a preflight check. | One-overshoot semantics (acceptable). |
| **B: Pre-call `countTokens` API** | Would prevent overshoot entirely. | Adds latency and a billable API call before every request; fails closed if the count call errors. |
| **C: Client-side token estimation** | No server round-trip. | Inaccurate for images/PDFs; easily bypassed; not available for server-side routes. |

### Sub-decision 3: How to reduce copilot system-prompt cost

| Option | Pros | Cons |
|---|---|---|
| **A: Content-block `cache_control: ephemeral`** (chosen) | SDK-native; no infra; turns 2..n read the cached prefix at ~10% cost; per-turn text stays outside the cached block so it never invalidates it. | Cache write on turn 1 costs ~125% of input (amortized across subsequent turns). |
| **B: Shorter system prompt** | Reduces raw token count. | The prompt already carries essential curriculum context — trimming it degrades output quality. |
| **C: No change** | Zero risk. | Continues paying full input price on every turn for identical content. |

## Implementation notes

- **Migration:** `drizzle/0018_ai_usage_accounting.sql` — four `ALTER TABLE … ADD COLUMN` statements (all nullable, no default) + one `CREATE INDEX` on `(owner_email, created_at)`.
- **Schema:** `src/db/schema/ai-interactions.ts` — adds `cacheReadTokens`, `cacheWriteTokens`, `ownerEmail`, `route` columns and the `idx_ai_interactions_owner_date` index.
- **Library:** `src/lib/ai-usage.ts` — exports `recordAiUsage()` (insert + charge), `billableTokens()` (weighted token count), `usageFromStream()` (safe extraction from a drained `MessageStream`).
- **Rate limit:** `src/lib/rate-limit.ts` — generalises the existing upsert into `bumpCounter(key, amount, windowMs)`, adds `chargeAiTokens()` and a read-only token-budget peek in `checkAiRateLimit()`.
- **Env var:** `AI_TOKEN_LIMIT_PER_HOUR` (default 2,000,000 billable tokens). Documented in CLAUDE.md alongside `AI_RATE_LIMIT_PER_HOUR`.
- **Copilot prompt caching:** `src/app/api/copilot/route.ts` — system prompt restructured as `TextBlockParam[]` with `cache_control: { type: "ephemeral" }` on the base-prompt + curriculum block.
- **Ratchet test:** `tests/lib/ai-usage.test.ts` — walks `src/app/api/**/route.ts` and fails the build if any file calling `getAnthropic()` lacks `recordAiUsage(` or `chargeAiTokens(`.

## Links

- ADR-0046 — established the precedent of Postgres for operational tables (`rate_limits`, `feedback`).
- ADR-0050 — `error_events` table, same pattern of "structured rows in Postgres over external services."
- [Anthropic prompt caching docs](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching) — `cache_control: { type: "ephemeral" }` semantics.
