# ADR-0021: Unit Notes Auth + Owner Scoping

- **Status:** Accepted
- **Date:** 2026-06-10
- **Deciders:** Jason
- **Tags:** security, authz, units, owner-scoping, backfill
- **Closes:** #157 (IDOR on notes endpoint), #176 (isNull guard grants cross-user write)

> Format: MADR 4.x (single-decision form). See [`template.md`](template.md).

## Context and Problem Statement

`POST /api/units/[id]/notes` saved teacher notes for any unit identified by UUID. The route had no authentication guard and no owner check, meaning:

1. **Unauthenticated write (issue #157):** Any caller who knew a unit UUID could overwrite `teacher_notes` without a session.
2. **IDOR (issue #157):** Any authenticated user could overwrite another user's unit notes by supplying an arbitrary UUID.
3. **NULL-owner regression → new IDOR (issue #176):** A draft fix added `OR owner_email IS NULL` to the WHERE predicate so that pre-migration units (which have no `owner_email`) would remain writable. As a side-effect, any authenticated user could overwrite notes on *any* pre-migration unit because `NULL ≠ email` evaluates to `NULL` (not `FALSE`) in SQL. In the current single-teacher deployment the blast radius is low, but the app is documented as targeting a small teaching community; a second legitimate user could silently overwrite another teacher's notes on all legacy units.

## Decision Drivers

- Close the unauthenticated + cross-user write path before onboarding a second user.
- Do not regress the teacher's access to units created before migration 0005.
- Forward-fix: new units must carry `owner_email` from the moment of creation.

## Decision Outcome

**Option A: Session guard + strict owner equality + pre-deploy backfill.**

- Add `owner_email TEXT` column to `units` (migration 0005).
- Gate `POST /api/units/[id]/notes` behind `getServerSession`; return 401 when `session.user.email` is absent.
- Use a strict equality WHERE: `WHERE id = $1 AND owner_email = $2`. The `isNull` guard is removed.
- Forward-fix `POST /api/year-plan/save`: pass `session.user.email` as `ownerEmail` on every unit insert. New units always have an owner from creation.
- Provide a one-time backfill script (`npm run db:backfill`) to set `owner_email` on all existing NULL rows before any second user is provisioned.

## Required Deployment Order

> ⚠️ **MUST be followed before onboarding a second user.**

1. `npm run db:migrate` — applies migration 0005 (adds `owner_email` column; existing rows are NULL).
2. `OWNER_EMAIL=teacher@example.com DATABASE_URL=... npm run db:backfill` — sets `owner_email` on all existing units.
3. Deploy the application — the strict WHERE clause is now safe because all rows have `owner_email`.

Skipping step 2 before deploying step 3 will cause the teacher to receive 404 on notes saves for legacy units. The fix is to run `db:backfill` and re-deploy.

## Consequences

### Positive

- Unauthenticated callers can no longer overwrite unit notes.
- Cross-user note overwrites are impossible once owner rows are set.
- New units (via `year-plan/save`) carry an owner from the first insert; no `isNull` guard is ever needed for them.

### Negative

- Strict WHERE requires the backfill to have run before this code is deployed. The deployment order above is mandatory.
- The `db:backfill` script requires `DATABASE_URL` + `OWNER_EMAIL` at run time; these are the same env vars already used in production (Vercel dashboard).

### Neutral

- The `owner_email` column is nullable to allow the two-step deployment (add column → backfill → remove guard). A future migration can promote it to `NOT NULL` once there is confidence that no NULL rows exist.

## Pros and Cons of the Options

### Option A: Strict equality + pre-deploy backfill (chosen)

- ✅ Closes the cross-user write IDOR completely once deployed.
- ✅ Idempotent backfill script; safe to re-run.
- ✅ Forward-fix ensures new units never need a NULL guard.
- ❌ Multi-step deployment; developer must remember the backfill step.

### Option B: Keep `isNull` guard + claim-on-write lazy backfill

- ✅ No multi-step deployment; teacher never gets 404.
- ❌ The cross-user write window remains open for any unclaimed units.
- ❌ Window closes only after the teacher has saved notes on every legacy unit — not guaranteed before a second user is provisioned.

### Option C: Claim-on-first-write sentinel

- Combining keep-isNull with `SET owner_email = COALESCE(owner_email, $email)` on every write.
- ❌ Same window problem as Option B; the sentinel is no different from the isNull guard semantically.

## Implementation Notes

- **Migration:** `drizzle/0005_unit_owner_email.sql` — `ALTER TABLE "units" ADD COLUMN "owner_email" text;`
- **Schema:** `src/db/schema/units.ts` — adds `ownerEmail: text("owner_email")`
- **Route:** `src/app/api/units/[id]/notes/route.ts` — `getServerSession` guard + strict `and(eq(units.id, id), eq(units.ownerEmail, userEmail))`
- **Forward-fix:** `src/app/api/year-plan/save/route.ts` — `getServerSession` guard + `ownerEmail` on insert
- **Backfill:** `scripts/backfill-owner-email.ts` + `npm run db:backfill`
- **Follow-up:** Once all rows are confirmed non-NULL, open a PR that promotes `owner_email` to `NOT NULL` and removes the nullable-column comment above.

## Links

- [Issue #157](https://github.com/jaetill/ai-teacher/issues/157) — original IDOR report
- [Issue #176](https://github.com/jaetill/ai-teacher/issues/176) — isNull cross-user write (closes this ADR)
- [PR #175](https://github.com/jaetill/ai-teacher/pull/175) — superseded draft (kept isNull guard, no backfill)
