# ADR-0014: Sentry SDK — `@sentry/nextjs` for ai-teacher observability

- **Status:** Accepted
- **Date:** 2026-05-15
- **Deciders:** Jason
- **Tags:** observability, sentry, nextjs, dependency

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

ADR-0009 chose Sentry as the error-tracking layer across the platform. ADR-0001 planned Phase 5 (Sentry integration) for ai-teacher and noted the observability delta: `@sentry/nextjs` instead of the AWS-oriented `@sentry/browser` + `@sentry/aws-serverless` used by game-night-pwa.

Phase 5 is now being implemented. The question: which Sentry SDK package should ai-teacher install, and how should it be configured for a Vercel-hosted Next.js App Router project — specifically around PII scrubbing, trace sampling, and build-time source-map upload?

This is the `new-external-dep` gate — `@sentry/nextjs` v10.x brings ~40 transitive packages into the dependency tree. The SDK choice and its configuration warrant explicit review.

## Decision Drivers

- **Platform alignment.** ADR-0009 mandates Sentry; ADR-0001 specifies `@sentry/nextjs` as the project delta. The SDK must honor both.
- **Next.js App Router compatibility.** The SDK must integrate with App Router's server components, edge runtime, and instrumentation hooks — not just the Pages Router.
- **PII scrubbing obligation.** ADR-0006 requires PII redacted at emit time. The SDK configuration must enforce this client-side and server-side.
- **Graceful degradation.** Local development and preview deploys may lack a Sentry DSN. The SDK must no-op cleanly, not crash the build or runtime.
- **Build reliability.** Source-map upload failures (missing auth token, network issues) must not break production deploys.
- **Bundle impact.** The SDK adds client-side JavaScript. The overhead should be proportionate to the value.

## Considered Options

- **Option A:** `@sentry/nextjs` — official Next.js SDK (unified package)
- **Option B:** `@sentry/react` + `@sentry/node` — separate client and server SDKs
- **Option C:** `@sentry/browser` + `@sentry/node` — generic lowest-level SDKs

## Decision Outcome

Chosen option: **Option A — `@sentry/nextjs`**, because it is the only SDK that auto-wires into Next.js's build pipeline (`withSentryConfig`), instrumentation hook (`instrumentation.ts`), and all three runtimes (browser, Node.js server, edge) from a single package. Options B and C would require manual wiring that the official SDK handles automatically, with no offsetting benefit.

Specific version: `^10.53.1` (Sentry SDK v10.x, the current major as of 2026-05).

## Consequences

### Positive

- **Single-package integration.** One dependency covers client, server, and edge runtimes. No manual webpack plugin configuration; `withSentryConfig` wraps `next.config.ts` and handles source-map upload, tree-shaking, and tunnel configuration.
- **Phase 5 unblocked.** ai-teacher gains error tracking and performance tracing per ADR-0009, closing the last observability gap before auto-rollback health signals can be wired.
- **PII scrubbing enforced.** `beforeSend` hooks on both client and server strip `user.email`, `user.username`, and form input values from breadcrumbs before events leave the browser or server process.
- **Graceful no-op.** All three config files (`instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`) guard initialization behind `if (dsn)`, so local dev without env vars works unchanged.
- **Build-safe source maps.** The `errorHandler` in `withSentryConfig` downgrades upload failures to warnings, preventing broken deploys when `SENTRY_AUTH_TOKEN` is unset.

### Negative

- **~40 transitive dependencies added.** `@sentry/nextjs` v10.x pulls in a significant dependency subtree. Supply-chain surface area increases. Mitigated by Sentry's status as a widely-audited, industry-standard package.
- **Client bundle size increase.** The Sentry browser SDK adds ~30-40 KB gzipped to the client bundle. Acceptable for a teacher-facing tool; would warrant review for a latency-sensitive public page.
- **Major-version coupling.** `@sentry/nextjs` v10.x must stay compatible with the project's Next.js version. Major Sentry SDK upgrades may require coordinated Next.js updates.

### Neutral

- **Session Replay not enabled.** The client config includes commented-out `replaysSessionSampleRate` / `replaysOnErrorSampleRate`. This is opt-in for later; no current driver to enable it.
- **Trace sample rate is 10% in production, 100% in development.** Standard practice. Can be tuned later without code changes (environment-variable-driven would require a small refactor).
- **No Sentry Crons or Profiling.** These Sentry features are available in v10 but not configured. Neither has a current use case; can be added incrementally.

## Pros and Cons of the Options

### Option A: `@sentry/nextjs` (official Next.js SDK)

- ✅ Pro: Single package covers browser, server, and edge runtimes.
- ✅ Pro: `withSentryConfig` auto-handles source-map upload, webpack integration, and tree-shaking.
- ✅ Pro: `instrumentation.ts` integration is first-class — documented by both Next.js and Sentry.
- ✅ Pro: Maintained by Sentry specifically for Next.js; App Router support is a primary target.
- ✅ Pro: Matches ADR-0001's recorded observability delta.
- ❌ Con: ~40 transitive dependencies; larger supply-chain surface.
- ❌ Con: Coupled to Next.js version compatibility matrix.

### Option B: `@sentry/react` + `@sentry/node` (separate SDKs)

- ✅ Pro: Slightly more control over which features are included per runtime.
- ❌ Con: No `withSentryConfig` — must manually configure webpack for source maps.
- ❌ Con: No automatic `instrumentation.ts` wiring for server/edge runtimes.
- ❌ Con: Two packages to keep in sync; risk of version skew.
- ❌ Con: Sentry's own docs recommend `@sentry/nextjs` for Next.js projects; going against official guidance.

### Option C: `@sentry/browser` + `@sentry/node` (generic SDKs)

- ✅ Pro: Most framework-agnostic; could theoretically migrate off Next.js with zero Sentry changes.
- ❌ Con: All the cons of Option B, plus: no React error boundary integration, no component-name enrichment, no automatic route-change tracking.
- ❌ Con: Significantly more manual wiring for equivalent functionality.
- ❌ Con: Framework-agnosticism provides no real value — ai-teacher is committed to Next.js.

## Implementation notes

- **Config files added:** `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation.ts` — all at repo root per `@sentry/nextjs` conventions. (Client config uses `instrumentation-client.ts` because Next.js 16 + Turbopack does not pick up the legacy `sentry.client.config.ts` filename.)
- **Build wrapper:** `next.config.ts` wrapped with `withSentryConfig`. Source-map upload reads `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` from environment.
- **Vercel env vars required:** `NEXT_PUBLIC_SENTRY_DSN` (runtime), `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` (build-time).
- **PII scrubbing pattern:** `beforeSend` in client and server configs strips `user.email` and `user.username`. Client config additionally redacts `ui.input` breadcrumb values. Follows the pattern from game-night-pwa per ADR-0006.
- **Standards doc:** [`docs/standards/06-observability.md`](../standards/06-observability.md) — ai-teacher's Sentry setup follows the standard's error-tracking section with Next.js-specific adaptations.

## Links

- [Sentry Next.js SDK docs](https://docs.sentry.io/platforms/javascript/guides/nextjs/) — official setup guide.
- [Next.js instrumentation hook](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation) — the `register()` / `onRequestError` pattern used.
- [Sentry data scrubbing](https://docs.sentry.io/platforms/javascript/data-management/sensitive-data/) — reference for PII handling.
- [ADR-0009](0009-observability.md) — platform decision that chose Sentry as the error-tracking layer.
- [ADR-0001](0001-platform-adoption.md) — project adoption plan that specified `@sentry/nextjs` and deferred Phase 5.
- [ADR-0006](0006-secrets.md) — PII redaction obligation driving the `beforeSend` scrubbing.
