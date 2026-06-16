# ADR-0021: Course Ownership via `owner_email` Column

- **Status:** Proposed
- **Date:** 2026-06-16
- **Deciders:** Jason
- **Tags:** schema, security, authorization

> Format: MADR 4.x (bundled sub-decisions). See [`template.md`](template.md).

## Context and Problem Statement

The `courses` table has no ownership concept — any authenticated user (and, before this PR, any unauthenticated caller) can read and modify any course via the `/api/curriculum/editor/data` endpoint. Issue #257 surfaced a concrete bug: when a second teacher account is introduced, courses created by one teacher are visible and editable by the other. Separately, the editor data endpoint lacked session gating entirely, exposing course data to unauthenticated requests.

Two questions need answering: (1) how should per-course ownership be represented in the schema, and (2) how should API routes enforce that ownership?

## Decision Drivers

- **Single-teacher reality today.** The app currently serves one teacher; ownership enforcement must not break existing courses that predate the column (they have NULL `owner_email`).
- **Minimal migration risk.** The column must be nullable so existing rows are unaffected by the `ALTER TABLE … ADD COLUMN` without a backfill or default.
- **Session infrastructure already exists.** NextAuth with `getServerSession` is already wired up; the enforcement pattern should reuse it.
- **Forward path to multi-tenant.** The ownership column should support a future where multiple teachers each see only their own courses, without requiring another schema migration.

## Considered Options

### Sub-decision 1: Ownership column design

- **Option A: `owner_email text` (nullable)** — store the session user's email directly; NULL means "legacy / unowned" and is treated as accessible to any authenticated user.
- **Option B: `owner_id uuid` FK to a `users` table** — normalize ownership via a dedicated users table; requires creating that table first.
- **Option C: No schema change; row-level security via Neon RLS** — use PostgreSQL RLS policies keyed on a session variable, no application-level column.

### Sub-decision 2: Access control enforcement pattern

- **Option D: Per-route session gate + ownership WHERE clause** — each API route calls `getServerSession`, returns 401 if missing, and adds `WHERE owner_email = ? OR owner_email IS NULL` to queries.
- **Option E: Drizzle middleware / global filter** — a Drizzle-level middleware that injects the ownership filter into every query automatically.
- **Option F: Next.js middleware** — a `middleware.ts` that gates `/api/curriculum/**` routes at the edge, with ownership checks deferred to the route handler.

## Decision Outcome

We chose the bundle:

- Sub-decision 1 → **Option A: `owner_email text` (nullable)**
- Sub-decision 2 → **Option D: Per-route session gate + ownership WHERE clause**

The bundle is internally consistent because the nullable `owner_email` column provides the predicate for the per-route WHERE clause, and the NULL-means-legacy semantics avoid a data migration while keeping existing courses accessible.

## Consequences

### Positive

- **Immediate security fix.** The editor data endpoint is now gated behind an authenticated session; unauthenticated requests return 401.
- **Multi-teacher safe.** Courses with a non-NULL `owner_email` are invisible to other users; the foundation for multi-tenant is in place without a second migration.
- **Zero-downtime migration.** The nullable `ADD COLUMN` requires no backfill, no table lock beyond a brief `ALTER TABLE`, and no coordinated deploy.
- **Legacy compatibility.** Existing courses (NULL `owner_email`) remain accessible to any authenticated user, preserving current behavior for the single-teacher case.

### Negative

- **Email as identifier is denormalized.** If the teacher changes their email in the auth provider, ownership breaks. A future `users` table with a stable UUID would be more robust.
- **NULL semantics are a transitional compromise.** "NULL = everyone can see it" is correct today but becomes a liability if the app gains untrusted users; a backfill-and-seal migration will be needed before that point.
- **Per-route enforcement is manual.** Every new API route that touches courses must remember to add the session check and ownership filter. No compile-time or framework-level guarantee prevents omission.

### Neutral

- **No new tables or FKs.** The migration is a single `ADD COLUMN`; the Drizzle schema diff and snapshot update are mechanical.
- **Pattern is easily portable.** The same `getServerSession` + WHERE pattern can be applied to other entity tables (units, lessons) when needed.

## Pros and Cons of the Options

### Sub-decision 1: Ownership column design

| Option | Pros | Cons |
|---|---|---|
| **A: `owner_email text` (nullable)** (chosen) | Zero-migration for existing rows; directly matches session claim; no new table needed | Denormalized; breaks if email changes; NULL semantics are transitional |
| **B: `owner_id uuid` FK to `users`** | Normalized; stable identifier; supports richer user profiles | Requires creating a `users` table and backfilling; heavier migration; premature for single-teacher phase |
| **C: Neon RLS** | Enforcement at the database level; impossible to bypass from app code | Requires `SET` of session variables per connection; harder to test locally; opaque to Drizzle ORM queries; Neon RLS is relatively new |

### Sub-decision 2: Access control enforcement pattern

| Option | Pros | Cons |
|---|---|---|
| **D: Per-route session gate + WHERE** (chosen) | Explicit; easy to audit; no new abstractions; matches existing codebase patterns | Manual; risk of omission on new routes |
| **E: Drizzle middleware** | Automatic injection; impossible to forget | Drizzle's middleware API is experimental; global filters are hard to opt out of for admin queries |
| **F: Next.js edge middleware** | Gates at the edge before the route handler runs | Cannot do ownership filtering (no DB access at the edge); only solves auth, not authorization |

## Implementation notes

- **Migration:** `drizzle/0005_easy_blur.sql` — `ALTER TABLE "courses" ADD COLUMN "owner_email" text;`
- **Schema:** `src/db/schema/courses.ts` — `ownerEmail: text("owner_email")` added to the `courses` table definition.
- **Endpoint hardened:** `src/app/api/curriculum/editor/data/route.ts` — now calls `getServerSession(authOptions)`, returns 401 if unauthenticated, and filters `WHERE owner_email = userEmail OR owner_email IS NULL`.
- **Follow-up: backfill.** Once the single teacher's email is stable, existing NULL-owner courses should be backfilled with `UPDATE courses SET owner_email = '<email>' WHERE owner_email IS NULL` and the NULL fallback removed.
- **Follow-up: other routes.** The same session + ownership pattern should be applied to other curriculum API routes (`/api/curriculum/units`, `/api/curriculum/lessons`, etc.).

## Links

- [Issue #257](https://github.com/jaetill/ai-teacher/issues/257) — the bug report that motivated this change.
- [PR #262](https://github.com/jaetill/ai-teacher/pull/262) — implementation PR.
- [NextAuth `getServerSession` docs](https://next-auth.js.org/configuration/nextauth#getserversession) — the session retrieval pattern used.
