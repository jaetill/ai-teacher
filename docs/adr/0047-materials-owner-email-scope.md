# ADR-0047: Materials ownership — `owner_email` column and scoped read/write predicates on `materials`

- **Status:** Accepted
- **Date:** 2026-06-30
- **Deciders:** Jason
- **Ratified:** 2026-06-30 (closes #562, #566)
- **Tags:** schema, security, authorization

> **Format:** This ADR follows [MADR 4.x](https://adr.github.io/madr/) with three documented extensions: (1) **Neutral consequences** as a third bucket alongside Positive/Negative; (2) **Implementation notes** as a separate section before Links; (3) **Bundled sub-decisions** when multiple related decisions are tightly coupled.

## Context and Problem Statement

The `materials` table had no ownership column. Eight API routes queried `materials` rows without any ownership predicate, so any authenticated user who reached these routes could read another user's material titles, Drive URLs, and inline content — a classic IDOR.

ADR-0044 closed the same gap on `drive_folders` by adding `owner_email` and applying `or(eq(ownerEmail, email), isNull(ownerEmail))` to all affected queries. The `materials` table needs the same treatment.

Several routes had _indirect_ protection because they joined `materials` through `materialAttachments` → `lesson` → `unit` → `course`, and `courses` is already scoped by `ownerEmail` (ADR-0021). However, that chain breaks when:

- The storage type is `url` or `inline` (no `driveFolderId` to scope on).
- A write-path inconsistency allows a cross-user `materialAttachment` row to exist.

Three routes listed in the review (`upload/classify`, `differentiation`, `copilot`) were evaluated and confirmed not to perform any direct `materials` table queries; no changes were required for those routes.

How should materials ownership be represented, and how should all read/write paths be hardened?

## Decision Drivers

- **Security.** The 8 read-path IDOR vectors on `materials` must be closed (issue #566).
- **Consistency with prior ownership ADRs.** ADR-0021 (`courses`) and ADR-0044 (`drive_folders`) establish the `owner_email` + open-null pattern.
- **No unique-constraint change required.** Unlike `drive_folders`, `materials` has no natural-key unique constraint that conflicts across users; only an `ADD COLUMN` migration is needed.
- **Legacy-row compatibility.** Existing rows have `owner_email = NULL`. The same open-null policy as ADR-0044 keeps them visible to any authenticated user without a backfill.

## Considered Options

- Sub-decision 1: Identity claim for the ownership column
- Sub-decision 2: Null-handling policy for legacy rows
- Sub-decision 3: Scope of write-path stamping

## Decision Outcome

We chose the bundle:

- Sub-decision 1 → **`owner_email` text column** (consistent with ADR-0021/0044)
- Sub-decision 2 → **Open-null policy** — queries use `or(eq(materials.ownerEmail, email), isNull(materials.ownerEmail))` so legacy rows remain accessible
- Sub-decision 3 → **All INSERT paths stamp `ownerEmail`** — `upload/file` and `drive/import` both receive `ownerEmail` from the session

## Consequences

### Positive

- **IDOR closed across all 8 affected read paths.** Every `materials` query now includes the `ownerEmail` predicate.
- **Defense in depth on join-based queries.** Routes like `curriculum/editor/data` and `units/[id]` already had indirect protection via course ownership; the explicit `materials.ownerEmail` predicate adds a second enforcement layer.
- **Consistent with ADR-0021/0044.** Same nullable `owner_email` column, same identity claim, same open-null read policy.
- **Write-path completeness.** All new `materials` rows created via `upload/file` or `drive/import` carry the session's `ownerEmail`, so future rows are fully attributable from day one.

### Negative

- **Denormalized identity.** Same email-change fragility as ADR-0021/0044 — rare for Google Workspace accounts.
- **Open-null exposes legacy rows.** Any authenticated user can read materials with `owner_email = NULL`. The exposure window closes once a post-deploy backfill runs.

### Neutral

- **Column is nullable by design.** Will become `NOT NULL` when a `users` table lands and all rows are backfilled.
- **`upload/classify`, `differentiation`, `copilot` require no changes.** These routes were listed in the review but confirmed not to query `materials` directly; no predicate or schema change applies.

## Pros and Cons of the Options

### Sub-decision 1: Identity claim

| Option | Pros | Cons |
|---|---|---|
| **`owner_email`** (chosen) | Consistent with ADR-0021/0044 (3-of-4 tables); no additional session wiring; email already on the session | Email-change fragility; inconsistent with ADR-0023's `user_id` |
| **`user_id` (OAuth `sub`)** | Immutable, stable across email changes | Inconsistent with `courses` and `drive_folders`; requires `token.sub` wiring on all affected routes |

### Sub-decision 2: Null-handling policy

| Option | Pros | Cons |
|---|---|---|
| **Open-null** (chosen) | Legacy rows remain accessible without backfill; zero operational steps post-deploy | Any authenticated user can read NULL-owner materials during migration window |
| **Fail-closed** | More secure during migration window | Locks out all pre-auth materials until backfilled; breaks curriculum loading for the existing teacher |

### Sub-decision 3: Write-path stamping scope

| Option | Pros | Cons |
|---|---|---|
| **All INSERT paths** (chosen) | Every new row is attributed; read-path predicates will match from day one | Two routes required simultaneous changes |
| **upload/file only** | Smaller diff | `drive/import` still creates un-attributed rows; read predicate is immediately inconsistent |

## Implementation notes

- **Migration:** `drizzle/0011_materials_owner_email.sql` — `ALTER TABLE "materials" ADD COLUMN "owner_email" text;`
- **Schema:** `src/db/schema/materials.ts` — `ownerEmail: text("owner_email")` added as nullable.
- **Write-path routes hardened (2 total):**
  - `src/app/api/upload/file/route.ts` — `ownerEmail` added to INSERT `.values()`
  - `src/app/api/drive/import/route.ts` — `ownerEmail` added to INSERT `.values()`
- **Read-path routes hardened (6 total direct queries, 2 join-based):**
  - `src/app/api/upload/check-duplicates/route.ts` — `or(eq(materials.ownerEmail, ownerEmail), isNull(...))` added to `dbMaterials` WHERE clause
  - `src/app/api/units/[id]/link-materials/route.ts` — predicate added to `quarterMaterials` query
  - `src/app/api/curriculum/editor/pool/route.ts` — predicate added to `courseMaterials` query (both folder-path and fallback attachment-path branches)
  - `src/app/api/import/build-curriculum/route.ts` — predicate added to `quarterMaterials` query
  - `src/app/api/units/[id]/route.ts` — predicate added to `lessonAttachments` and `unitMaterials` join queries (defense in depth; course ownership already protects these transitively)
  - `src/app/api/curriculum/editor/data/route.ts` — predicate added to `lessonMats` and `assessmentMats` join queries (same defense-in-depth rationale)
- **Routes confirmed safe (no change):**
  - `src/app/api/upload/classify/route.ts` — classifies filenames only; no DB query on `materials`
  - `src/app/api/differentiation/route.ts` — operates on request-body content; no `materials` query
  - `src/app/api/copilot/route.ts` — `buildCurriculumContext` queries courses/units/lessons/standards; does not query `materials`
  - `src/app/api/curriculum/editor/update-material/route.ts` — write path protected by `assertCourseOwnership`; the pre-update `materialType` SELECT reads a single field by known UUID with ownership validated upstream
- **Tests:** Two IDOR regression tests added to `tests/api/upload/check-duplicates.test.ts` (scopes materials DB lookup to caller's email; cross-user isolation).
- **Backfill (recommended post-deploy):** `UPDATE materials SET owner_email = '<teacher-email>' WHERE owner_email IS NULL;`
- **PR #562 superseded:** That PR added `ownerEmail` stamping to `upload/file` only. This PR incorporates those changes alongside the full read-path fix; PR #562 should be closed.

## Links

- [OWASP IDOR](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/05-Authorization_Testing/04-Testing_for_Insecure_Direct_Object_References) — the vulnerability class this addresses.
- [Issue #566](https://github.com/jaetill/ai-teacher/issues/566) — the 12-route read-path IDOR report.
- [PR #562](https://github.com/jaetill/ai-teacher/pull/562) — prior partial fix (write-path only); superseded by this PR.
- [ADR-0021](0021-course-ownership-column.md) — prior art: `owner_email` on `courses`.
- [ADR-0022](0022-copilot-conversation-ownership-column.md) — prior art: `owner_email` on `copilot_conversations`.
- [ADR-0044](0044-drive-folders-owner-email-scope.md) — prior art: `owner_email` on `drive_folders`, open-null policy.
