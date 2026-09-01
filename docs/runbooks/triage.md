# Triage — "something went wrong" / a user saw an error

## When to use this

Heidi reports an error, an uptime check fails, or a Sentry alert fires.

## Prerequisites

- A SQL client on the production database (`npm run db:studio` with the prod
  URL exported in the shell, or the Neon console SQL editor)
- Sentry project access

## Steps

### 1. Is it up?

```
curl -s https://ai-teacher-omega-sage.vercel.app/api/health
```

`{"ok":true,...}` → app and DB fine, go to step 2. `503` → DB unreachable
(Neon status, or `DATABASE_URL` in Vercel Production scope). Anything else →
Vercel status, then `rollback.md`.

### 2. What did the server actually say?

Every refusal and every 5xx writes a row. This is the first query, always:

```sql
select created_at, route, status, reason, message, owner_email, detail
from error_events
order by created_at desc
limit 20;
```

- `reason` is a stable code (`attachments_too_large`, `upstream_failed`,
  `write_failed`, `unhandled`, …). Group by it to see whether this is one user
  hitting a limit or a systemic failure:

  ```sql
  select reason, route, status, count(*), max(created_at)
  from error_events
  where created_at > now() - interval '24 hours'
  group by 1,2,3 order by 4 desc;
  ```
- `detail` carries the measurements (sizes, counts, limits) — enough to say
  *which* guard fired without seeing her content.
- `message` is the sentence she saw. If the UI showed something else
  ("Something went wrong"), that's a UI bug, not a server one.

### 3. Was it a 5xx? Then Sentry has the stack

Every 5xx logged through `apiError()`/`refuse()` is also
`captureException`'d with tags `route`, `reason`, `status`. Sentry → Issues →
filter `route:/api/whatever`. The `release` tag is the deploy SHA — compare
against `/api/health`'s `release` to see if it's the current deploy.

### 4. Is Claude or Google the one failing?

`reason = 'upstream_failed'` with `detail.upstreamStatus` 429/529 → Anthropic
overloaded or rate-limited; it retries twice and then gives up. Nothing to fix;
tell her to try again in a minute. `invalid_grant` in Sentry → her Google
refresh token died; she needs to sign out and back in.

### 5. Rate limit?

`AI_RATE_LIMIT_PER_HOUR` (default 40) is per user per hour across all AI
routes. Check:

```sql
select * from rate_limits order by window_start desc limit 5;
```

## Verification

The next row in `error_events` for that user is not the same `reason`, or
there isn't one.

## Escalation

Single operator. Nothing here is customer-facing beyond one teacher; a
same-day answer is the SLA.
