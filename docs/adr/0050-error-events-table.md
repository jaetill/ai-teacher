# ADR-0050: Postgres `error_events` table for server-side refusal logging

- **Status:** Proposed
- **Date:** 2026-08-30
- **Deciders:** Jason
- **Tags:** schema, observability, copilot

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

On 2026-08-30 a copilot turn returned HTTP 413 and the panel replaced the server's message with "Something went wrong." Vercel logs status codes but not response bodies. Six separate guards on `/api/copilot` return 413 for different reasons (context too large, too many messages, user message too long, transcript too long, too many attachments, attachments too large), so the question "which guard fired?" could only be narrowed by elimination — never confirmed.

How should the app record server-side refusals so that triage can identify the exact guard, the measurements that triggered it, and the message the user saw?

## Decision Drivers

- **Post-incident answerability.** A single query must identify which guard fired, with the measurements that triggered it, hours or days after the fact.
- **Zero-cost failure path.** A logging failure must never turn a clear 413 into an opaque 500. The user's error response must be unaffected.
- **Privacy.** Diagnostic rows must carry measurements (character counts, byte sizes, limits), never message text, filenames, or file contents.
- **No new vendor.** Reuse the existing Neon/Postgres database — no external logging service or new credential pair (consistent with ADR-0046).
- **Enforceability.** The logging path must be structurally hard to forget when adding new guards.

## Considered Options

- **Option A: Postgres `error_events` table with a `refuse()` helper**
- **Option B: Structured console logging (Vercel Logs / Log Drains)**
- **Option C: Sentry custom events**

## Decision Outcome

Chosen option: **Option A — a Postgres `error_events` table with a `refuse()` helper that builds the HTTP response and writes the row in one call.** The helper makes it structurally difficult to add a refusal path that forgets to log: every guard calls `refuse()` instead of constructing a bare `new Response()`, so logging is a side-effect of responding, not a separate step.

## Consequences

### Positive

- **Incident triage starts with one query.** `SELECT route, status, reason, message, detail FROM error_events ORDER BY created_at DESC LIMIT 20` answers "what happened and why" without redeploying or correlating logs.
- **Guard identification is unambiguous.** Each guard has a stable `reason` code (`context_too_large`, `transcript_too_long`, etc.) that groups across releases.
- **Measurements travel with the event.** The `detail` JSONB column carries the exact numbers (transcript chars, attachment bytes, limits) so the guard's threshold can be evaluated without reproducing the request.

### Negative

- **One write per refusal.** Acceptable at this app's volume; refusals are infrequent by nature. If the table grows, a periodic `DELETE WHERE created_at < now() - interval '90 days'` suffices.
- **Rows accumulate without automatic cleanup.** Same tradeoff as `rate_limits` (ADR-0046) — acceptable now, revisit if needed.

### Neutral

- **Logging is best-effort, not transactional.** `logErrorEvent` swallows errors and falls back to `console.error`. This means a Postgres outage silently drops diagnostic rows — but that's the right tradeoff, because the alternative (letting the insert failure propagate) would mask the user's actual error.

## Pros and Cons of the Options

### Option A: Postgres `error_events` table with `refuse()` helper (chosen)

- ✅ Pro: No new vendor or dependency; reuses existing Neon DB and `DATABASE_URL`.
- ✅ Pro: `refuse()` couples response + logging, making it hard to add an unlogged guard.
- ✅ Pro: Queryable with standard SQL; no dashboard or external tool required.
- ✅ Pro: `reason` codes are typed (`ErrorReason` union) and stable across releases.
- ❌ Con: One DB write per refusal (negligible at current scale).
- ❌ Con: Rows accumulate without TTL (mitigable with a cleanup query).

### Option B: Structured console logging (Vercel Logs / Log Drains)

- ✅ Pro: Zero schema change; no migration.
- ✅ Pro: Console output is already captured by Vercel.
- ❌ Con: Vercel log retention is limited (free: 1 hour, Pro: 3 days). The 2026-08-30 incident would have scrolled off before investigation started on many plans.
- ❌ Con: Querying structured data in log drains requires a third-party log aggregator (Datadog, Axiom, etc.) — a new vendor.
- ❌ Con: No structural enforcement; a new guard that forgets `console.log` is silently unlogged.

### Option C: Sentry custom events

- ✅ Pro: Already integrated (`@sentry/nextjs`); dashboard + alerting for free.
- ❌ Con: Sentry is for exceptions and performance, not expected refusals. Sending every 413 as a Sentry event inflates error counts and desensitizes alerts.
- ❌ Con: Does not carry the structured `detail` measurements naturally (would need custom contexts/tags).
- ❌ Con: Same enforcement gap as Option B — nothing prevents a bare `new Response()`.

## Implementation notes

- **Schema:** `src/db/schema/error-events.ts` — `error_events(id uuid PK, route text, status smallint, reason text, message text, owner_email text, conversation_id uuid, detail jsonb, created_at timestamptz)`. Three indexes: `(created_at)`, `(reason, created_at)`, `(route, status)`. Migration: `drizzle/0017_add_error_events.sql`.
- **Helper:** `src/lib/error-log.ts` exports `refuse()` (builds Response + writes row) and `logErrorEvent()` (write-only, for mid-stream failures where no Response is returned). Both swallow insert errors to preserve the user-facing outcome.
- **Reason codes:** Typed as `ErrorReason` union — `invalid_json`, `missing_messages`, `bad_conversation_id`, `context_too_large`, `too_many_messages`, `user_message_too_long`, `transcript_too_long`, `too_many_attachments`, `malformed_attachment`, `attachments_too_large`, `unauthorized`, `forbidden`, `stream_failed`.
- **Privacy constraint** documented in schema and CLAUDE.md: `detail` carries counts, byte sizes, and limits only — never message text, filenames, or file contents.
- **Convention** added to CLAUDE.md: "Never return a bare `new Response(...)` for an error — use `refuse()`."

## Links

- ADR-0046 — established the precedent of using Postgres over external services for operational tables.
