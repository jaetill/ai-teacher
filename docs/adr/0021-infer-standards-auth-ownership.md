# ADR-0021: Add authentication and ownership enforcement to infer-standards route

- **Status:** Proposed
- **Date:** 2026-06-04
- **Deciders:** Jason
- **Tags:** api-contract, security, schema

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled (each sub-decision gets its own Considered Options and Pros and Cons sections).

## Context and Problem Statement

`POST /api/units/[id]/infer-standards` invokes Claude to map standards to lessons and persists the results — an expensive, side-effecting operation. Prior to this change, the route had no authentication or authorization checks: any unauthenticated caller could trigger AI inference against any unit, burning API credits and writing to the database. This is an IDOR (Insecure Direct Object Reference) vulnerability reported in issue #117.

How should this route enforce access control, and what data-model changes are needed to support per-user ownership of units?

## Decision Drivers

- **Security:** an unauthenticated route that calls a paid AI API and writes to the database is a cost and integrity risk.
- **IDOR prevention:** even authenticated users should not be able to trigger inference on units they do not own.
- **Backwards compatibility:** existing units (created before auth existed) have no owner. The migration must be non-destructive.
- **Simplicity:** the app currently has a single user; the ownership model should be minimal but extensible.

## Considered Options

- Sub-decision 1: Authentication mechanism for the route
- Sub-decision 2: Ownership model for units
- Sub-decision 3: Handling of pre-auth (ownerless) units

## Decision Outcome

We chose the bundle:

- Sub-decision 1 → **NextAuth session check (401)**
- Sub-decision 2 → **Nullable `user_id` column on units, checked at the route level (403)**
- Sub-decision 3 → **Permissive for null — owner-check only applies when `userId` is set**

The bundle is internally consistent because the session provides the `user.id` (Google `sub` claim) that the ownership check compares against, and the nullable column lets pre-auth rows continue working without a backfill.

## Consequences

### Positive

- Closes the IDOR vulnerability: unauthenticated requests get 401, wrong-user requests get 403.
- AI inference costs are protected — only authenticated owners can trigger Claude calls.
- Zero-downtime migration: `ALTER TABLE ADD COLUMN` with no `NOT NULL` constraint is non-locking and backwards-compatible.

### Negative

- Pre-auth units (where `userId IS NULL`) are accessible to any authenticated user. This is an accepted trade-off for a single-user app; when multi-user support lands, a backfill or stricter policy is needed.
- The ownership check is at the route level, not middleware. As more routes need the same pattern, this will need extraction into shared middleware or a decorator.

### Neutral

- The `user.id` exposed in the NextAuth session is the Google `sub` claim (opaque string), not an internal database ID. This is fine for the current auth provider but would need mapping if a second provider is added.
- The API contract changes are additive failure modes (401, 403) — the success-path response shape is unchanged.

## Pros and Cons of the Options

### Sub-decision 1: Authentication mechanism

| Option | Pros | Cons |
|---|---|---|
| **NextAuth session check** (chosen) | Already integrated; `getServerSession()` is one call; consistent with other protected routes if they exist | Server-side session lookup on every request; no API-key path for future automation |
| **Custom API key / bearer token** | Stateless; better for non-browser clients | Additional auth surface to manage; not needed for a browser-only app today |
| **Middleware-level auth (Next.js middleware)** | Centralizes auth; protects all routes by default | Coarser granularity; harder to exempt public routes; middleware runs at the edge (different runtime) |

### Sub-decision 2: Ownership model

| Option | Pros | Cons |
|---|---|---|
| **Nullable `user_id` column on `units`** (chosen) | Simple; one migration; ownership check is a single `WHERE` comparison | Not a full RBAC model; no sharing, no roles |
| **Separate `unit_owners` join table** | Supports multiple owners, roles, sharing | Over-engineered for single-user; extra join on every query |
| **No ownership — auth-only (no 403)** | Simplest change; just add 401 | Does not close the IDOR — any authenticated user can act on any unit |

### Sub-decision 3: Pre-auth unit handling

| Option | Pros | Cons |
|---|---|---|
| **Permissive for null** (chosen) | Non-breaking; no backfill required; existing units keep working | Ownerless units are accessible to any authenticated user |
| **Backfill all existing units to current user** | Clean ownership from day one | Requires knowing who the "current user" is at migration time; fragile if run in CI |
| **Deny access to ownerless units** | Strictest security posture | Breaks all existing units until manually claimed; bad UX |

## Implementation notes

- Migration: `drizzle/0005_add_user_id_to_units.sql` — `ALTER TABLE "units" ADD COLUMN "user_id" text;`
- Schema: `src/db/schema/units.ts` — `userId: text("user_id")`
- Route: `src/app/api/units/[id]/infer-standards/route.ts` — session check (401) + ownership check (403)
- Auth: `src/lib/auth.ts` — exposes `token.sub` as `session.user.id`
- Types: `src/types/next-auth.d.ts` — extends `Session` interface with `user.id`
- Tests: `tests/api/units-infer-standards.test.ts` — covers 401 and 403 paths

## Links

- [Issue #117](https://github.com/jaetill/ai-teacher/issues/117) — IDOR report
- ADR-0003 — CI/CD and ADR-gated categories (this change triggers: api-contract, security-relevant, schema/data-model)
