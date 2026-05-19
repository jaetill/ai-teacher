# ADR-0015: Feedback Widget — `@octokit/rest` + `POST /api/feedback` for ai-teacher

- **Status:** Proposed
- **Date:** 2026-05-19
- **Deciders:** Jason
- **Tags:** user-feedback, new-external-dep, api-contract, nextjs, github-issues

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

ADR-0012 established the platform-level user-feedback architecture: a two-tier widget pattern (Sentry User Feedback + custom form), GitHub Issues as storage, `triage-bot` for classification, and per-IP rate limiting. ADR-0001 recorded the ai-teacher-specific delta: Next.js API route instead of Lambda + API Gateway, Octokit for GitHub Issues creation, and in-memory rate limiting per warm instance.

Phase 7 is now being implemented. Two decisions need explicit review:

1. **New external dependency.** `@octokit/rest` ^21.0.0 is added to `package.json`. This brings a non-trivial dependency subtree into the project for GitHub API interaction.
2. **New API contract.** `POST /api/feedback` is a public-facing endpoint accepting user-submitted feedback and creating GitHub Issues. Its request/response shape, validation rules, and error codes form a contract that clients depend on.

## Decision Drivers

- **Platform alignment.** ADR-0012 mandates GitHub Issues as feedback storage and Octokit as the API client. The implementation must honor that architecture.
- **Next.js hosting model.** ai-teacher runs on Vercel as a Next.js App Router project. No API Gateway or Lambda — the feedback endpoint is a Next.js route handler.
- **Secrets posture.** Vercel environment variables replace AWS Secrets Manager. The GitHub PAT (`GITHUB_TOKEN`) must be set in Vercel project settings, not fetched from a secrets service at runtime.
- **Serverless rate-limiting constraints.** Vercel functions are stateless across cold starts. In-memory rate limiting is per-instance, not global — acknowledged as a known limitation in ADR-0001.
- **PII discipline.** ADR-0006 requires PII minimization. The feedback form collects only what the user types; email is optional with clear opt-in language.
- **Spam resistance.** ADR-0012 requires per-IP rate limiting + honeypot as the baseline. The implementation must include both.

## Considered Options

The bundle has two sub-decisions:

- **Sub-decision 1 — GitHub API client (new-external-dep gate):** chose **`@octokit/rest`**
- **Sub-decision 2 — API contract shape (api-contract gate):** chose **Typed JSON endpoint with structured error codes**

## Decision Outcome

We chose the bundle:

- Sub-decision 1 → `@octokit/rest` ^21.0.0
- Sub-decision 2 → `POST /api/feedback` with typed request/response and semantic HTTP status codes

The bundle is internally consistent because the API route's server-side implementation depends on the chosen GitHub client library — changing the client changes the route's error semantics and authentication pattern.

## Consequences

### Positive

- **Phase 7 complete.** ai-teacher gains user-facing feedback collection per ADR-0012, closing the last deferred platform phase that has a current driver.
- **Unified work queue.** User feedback and developer-filed issues land in the same GitHub Issues tracker, processed by the same triage flow.
- **Type-safe GitHub API.** `@octokit/rest` provides typed methods for issue creation, reducing the risk of malformed API calls compared to raw `fetch`.
- **Consistent contract.** Structured error codes (`invalid_json`, `validation_error`, `rate_limited`, `configuration_error`, `github_issue_creation_failed`) let the client handle each failure mode distinctly.
- **Spam baseline met.** Per-IP rate limiting (10/hour) and honeypot field are implemented per ADR-0012's minimum requirements.

### Negative

- **New dependency subtree.** `@octokit/rest` ^21.0.0 and its transitive dependencies increase the supply-chain surface. Mitigated by Octokit's status as GitHub's official SDK — widely audited, actively maintained.
- **In-memory rate limiting is per-instance.** On Vercel, each function invocation may hit a different instance. A determined attacker rotating across instances bypasses the limit. This is the same known limitation documented in ADR-0001. Global rate limiting (Vercel KV, Upstash Redis) is a future enhancement if abuse materializes.
- **GitHub PAT as env var.** The token sits in Vercel's environment variable store rather than a secrets manager with rotation support. Acceptable for a single-user project; would need revisiting for team use.

### Neutral

- **Sentry User Feedback (Tier 1) not implemented in this PR.** ADR-0012's two-tier pattern includes Sentry's crash-context widget. This PR implements only Tier 2 (custom form). Tier 1 can be added independently by enabling `Sentry.feedbackIntegration()` in the client config.
- **Auto-reply (SES) not wired.** ADR-0012's sub-decision 3 (email confirmation on close) is deferred. The email field is collected and stored on the GitHub Issue but no transactional email is sent. This is consistent with ADR-0001's deferral posture.
- **`triage-bot` integration is implicit.** The `feedback:user-submitted` and `type:*` labels are applied per ADR-0012's schema. `triage-bot` will pick these up once its GitHub Issues input source is configured (separate work).

## Pros and Cons of the Options

### Sub-decision 1: GitHub API client (new-external-dep)

| Option | Pros | Cons |
|---|---|---|
| **`@octokit/rest`** (chosen) | GitHub's official SDK; typed API; handles auth, pagination, error mapping; aligned with ADR-0012 | Adds dependency subtree (~20 transitive packages); version coupling with GitHub API changes |
| **Raw `fetch` to GitHub REST API** | Zero dependencies; full control over request shape | No type safety; must handle auth headers, pagination, error parsing manually; reimplements what Octokit provides |
| **`@octokit/core`** (minimal Octokit) | Smaller footprint than `@octokit/rest`; still handles auth | No typed endpoint methods; must construct paths and parse responses manually; marginal size savings |
| **GraphQL via `@octokit/graphql`** | More flexible queries; single request for complex operations | Overkill for `issues.create`; GraphQL adds query complexity for a single mutation; larger learning curve |

### Sub-decision 2: API contract shape (api-contract)

| Option | Pros | Cons |
|---|---|---|
| **Typed JSON with semantic status codes** (chosen) | Client can branch on `error` field + HTTP status; validation errors include `detail`; rate-limit responses include `retry_after_seconds` and `Retry-After` header | Requires client to handle multiple error shapes |
| **Plain 200-for-everything with status in body** | Simpler client fetch logic | Breaks HTTP semantics; caching proxies and monitoring tools can't distinguish success from failure |
| **Form-encoded submission** | Works without JavaScript; progressive enhancement | Requires redirect-based flow; loses structured error responses; doesn't fit the SPA architecture |

#### Contract specification: `POST /api/feedback`

**Request body** (JSON):

| Field | Type | Required | Constraints |
|---|---|---|---|
| `type` | string | yes | One of: `bug`, `feature`, `other` |
| `description` | string | yes | 10–2000 characters |
| `email` | string | no | Must contain `@`, max 254 chars |
| `page_url` | string | no | Populated by client automatically |
| `user_agent` | string | no | Populated by client automatically |
| `website` | string | no | Honeypot — non-empty triggers silent drop |

**Response codes**:

| Status | Body shape | Meaning |
|---|---|---|
| `201` | `{ id: string, status: "received" }` | Issue created (or honeypot-dropped, same shape) |
| `400` | `{ error: "invalid_json" }` or `{ error: "validation_error", detail: string }` | Malformed or invalid input |
| `429` | `{ error: "rate_limited", retry_after_seconds: number }` | Per-IP limit exceeded (10/hour/instance) |
| `500` | `{ error: "configuration_error" }` | `GITHUB_TOKEN` env var missing |
| `502` | `{ error: "github_issue_creation_failed" }` | GitHub API call failed |

## Implementation notes

- **Route handler:** `src/app/api/feedback/route.ts` — Next.js App Router POST handler.
- **UI component:** `src/components/FeedbackButton.tsx` — fixed-position button + modal dialog, rendered in root layout.
- **Env vars required (Vercel):** `GITHUB_TOKEN` (PAT with `issues:write` on `jaetill/ai-teacher`), optional `GITHUB_REPO_OWNER` and `GITHUB_REPO_NAME` (default to `jaetill` / `ai-teacher`).
- **GitHub Issue labels applied:** `feedback:user-submitted`, `type:{bug|feature|other}` — per ADR-0012's labeling schema.
- **Markdown escaping:** Issue title and body escape markdown metacharacters to prevent injection of formatting via user input.
- **Rate-limit bucket cleanup:** In-memory map is capped at 10,000 entries with lazy eviction of expired windows to prevent memory growth on long-lived instances.
- **Standards doc:** [`docs/standards/11-user-feedback.md`](../standards/11-user-feedback.md).

## Links

- [Octokit REST docs](https://octokit.github.io/rest.js/) — `@octokit/rest` API reference.
- [GitHub Issues API](https://docs.github.com/en/rest/issues/issues) — underlying REST endpoint.
- [ADR-0012](0012-user-feedback.md) — platform-level feedback architecture (two-tier widget, GitHub Issues storage, triage flow).
- [ADR-0001](0001-platform-adoption.md) — project adoption plan recording the Phase 7 delta (Next.js route + Octokit + Vercel env vars).
- [ADR-0006](0006-secrets.md) — PII discipline applied to the optional email field.
- [ADR-0014](0014-sentry-nextjs-sdk.md) — Sentry SDK; Tier 1 (Sentry User Feedback) would layer on this.
