# ADR-0021: Require NextAuth session on all AI API routes

- **Status:** Proposed
- **Date:** 2026-06-03
- **Deciders:** Jason
- **Tags:** api-contract, security, auth

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

All five Claude-powered API routes (`/api/copilot`, `/api/curriculum`, `/api/differentiation`, `/api/year-plan`, `/api/communications`) were publicly accessible — any HTTP client could POST to them and stream unlimited tokens charged to the project's `ANTHROPIC_API_KEY`. This is a cost-exposure and abuse vector: an unauthenticated caller can run up an unbounded Anthropic bill or scrape AI-generated content.

The project already has NextAuth (Google provider) configured at `src/lib/auth.ts` and used by the Google Drive routes. How should we gate the AI routes, and at what granularity?

## Decision Drivers

- **Cost containment.** Anthropic API calls are metered per token. Unauthenticated access means unbounded spend from any internet client.
- **Minimal friction.** The app has a single primary user today. The auth mechanism should not add deployment complexity or require new infrastructure.
- **Consistency.** The Google Drive routes already use `getServerSession(authOptions)`. AI routes should follow the same pattern rather than introducing a parallel auth mechanism.
- **Fail-closed.** An absent or expired session must block the request before any Anthropic API call is made, not after.
- **No new dependencies.** The project already ships `next-auth`; adding another auth layer (API keys, JWTs, etc.) would increase surface area for no gain at current scale.

## Considered Options

- **Option A:** NextAuth session guard — `getServerSession(authOptions)` at the top of each POST handler
- **Option B:** Middleware-level auth — a single Next.js middleware that gates `/api/*` routes
- **Option C:** Per-route API key — each route checks a shared secret via `Authorization: Bearer <key>`

## Decision Outcome

Chosen option: **Option A — NextAuth session guard per route**, because it reuses the existing auth infrastructure with zero new dependencies, follows the pattern already established by the Drive routes, and keeps the guard visible in each route file rather than hidden in middleware. At the current scale (five routes, one user), the small repetition is worth the explicitness.

## Consequences

### Positive

- **Cost exposure eliminated.** Unauthenticated callers receive 401 before any body parsing or Anthropic API call. The `ANTHROPIC_API_KEY` can no longer be consumed by anonymous traffic.
- **Zero new dependencies.** Reuses `next-auth` and `authOptions` already in the dependency tree and Vercel environment.
- **Pattern consistency.** All API routes now follow the same auth pattern: `getServerSession` check, then business logic.
- **Fail-closed by construction.** The guard is the first statement in each handler; no code path reaches Anthropic without a valid session.

### Negative

- **Breaking change for unauthenticated clients.** Any tooling, scripts, or curl commands that hit these routes without a session cookie will now receive 401. This is intentional but is a contract change.
- **Repeated boilerplate.** Five routes each contain the same 4-line guard block. If the route count grows significantly, consolidating into middleware (Option B) would reduce duplication.

### Neutral

- **No authorization (only authentication).** Any authenticated user can call any route. Fine for a single-user app; would need revisiting if multi-user access control is added later.
- **Session cookie transport.** The browser's existing NextAuth session cookie is sent automatically on fetch requests to same-origin API routes. No client-side code changes were needed.

## Pros and Cons of the Options

### Option A: NextAuth session guard per route

- ✅ Pro: Zero new dependencies or configuration; reuses `authOptions` from `src/lib/auth.ts`.
- ✅ Pro: Guard is visible in each route file — easy to audit, no "magic" middleware.
- ✅ Pro: Matches the existing Drive route pattern exactly.
- ✅ Pro: Fail-closed: session check is the first statement before body parsing.
- ❌ Con: Repeated 4-line block in each route. Scales linearly with route count.
- ❌ Con: A new route could forget the guard. No compile-time enforcement.

### Option B: Middleware-level auth

- ✅ Pro: Single point of enforcement — impossible to forget the guard on a new route.
- ✅ Pro: Could gate entire path prefixes (e.g., `/api/ai/*`) with one matcher.
- ❌ Con: Next.js middleware runs at the edge; `getServerSession` requires the Node.js runtime. Would need a token-based check or JWT decode instead, adding complexity.
- ❌ Con: Hides the auth requirement from individual route files — less obvious during code review.
- ❌ Con: Middleware applies broadly; requires careful matcher config to avoid blocking public routes (e.g., health checks, webhooks).

### Option C: Per-route API key (Bearer token)

- ✅ Pro: Works for server-to-server or CLI callers without a browser session.
- ❌ Con: Adds a new secret to manage (`AI_API_KEY` in Vercel env vars), rotating separately from Google OAuth credentials.
- ❌ Con: Browser-based calls would need to fetch and attach the key, complicating the client.
- ❌ Con: Diverges from the NextAuth pattern used everywhere else in the app.
- ❌ Con: A static key is weaker than session-based auth (no expiry, no revocation without rotation).

## Implementation notes

- **Affected routes:** `src/app/api/copilot/route.ts`, `src/app/api/curriculum/route.ts`, `src/app/api/differentiation/route.ts`, `src/app/api/year-plan/route.ts`, `src/app/api/communications/route.ts`.
- **Guard pattern:** Each route's `POST` handler now starts with:
  ```ts
  const session = await getServerSession(authOptions);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  ```
- **No client changes required.** The browser already holds a NextAuth session cookie from Google sign-in; `fetch()` calls to same-origin `/api/*` routes include it automatically.
- **Existing auth config:** `src/lib/auth.ts` — NextAuth with Google provider, unchanged by this PR.

## Links

- [NextAuth `getServerSession`](https://next-auth.js.org/configuration/nextjs#getserversession) — the server-side session retrieval used in each guard.
- [Issue #7](https://github.com/jaetill/ai-teacher/issues/7) — the security issue that prompted this change.
- [ADR-0006](0006-secrets.md) — secrets management; `ANTHROPIC_API_KEY` is the secret being protected here.
