# Migration 0008 — owner-scoped data model: apply runbook

**Migration:** `drizzle/0008_owner_email_not_null_backfill.sql`
**ADR:** [ADR-0024](../docs/adr/0024-authorization-model-and-owner-backfill.md)

This migration backfills every `NULL`-`owner_email` row to the single real owner, makes `owner_email` `NOT NULL` on `courses` and `copilot_conversations`, and widens the `courses` unique constraint to include `owner_email`. It runs in a **single transaction** — all-or-nothing.

> ⚠️ **This is a security/data-model change on a LIVE app with one real user (the owner). The order below is mandatory. Getting it wrong locks the owner out of their own data.**

---

## Required apply order

### Step 1 — Replace the owner-email placeholder

Open `drizzle/0008_owner_email_not_null_backfill.sql` and replace **every** occurrence of the literal `__OWNER_EMAIL__` with the owner's real Google account email (the single live user's email).

There are two occurrences (the `courses` backfill and the `copilot_conversations` backfill). Do **not** commit the real email — substitute it locally at apply time only.

Verify none remain:

```bash
grep -n "__OWNER_EMAIL__" drizzle/0008_owner_email_not_null_backfill.sql
# (should print nothing)
```

If a placeholder is missed, the migration fails loudly — the literal string `__OWNER_EMAIL__` becomes a row's owner, which no session email will ever match (visible immediately, not a silent grant).

### Step 2 — Apply the migration to the database (BEFORE deploying code)

```bash
npm run db:migrate          # drizzle-kit migrate, against DATABASE_URL
```

This must complete successfully **before** the new application code is deployed. After it runs:

- every `courses` / `copilot_conversations` row has a non-NULL `owner_email`,
- the columns are `NOT NULL`,
- `uq_courses_grade_subject_year` includes `owner_email`.

Sanity check (optional):

```sql
SELECT count(*) FROM courses               WHERE owner_email IS NULL;  -- expect 0
SELECT count(*) FROM copilot_conversations WHERE owner_email IS NULL;  -- expect 0
```

### Step 3 — Deploy the code (only AFTER Step 2 succeeds)

Deploy the application. The new code assumes `owner_email` is always populated: it stamps the owner on every course insert and scopes reads/writes by `eq(ownerEmail, email)` with no NULL-fallback arm.

**Why the order matters:** if the new code deployed *before* the backfill, any pre-existing `NULL`-owner row would no longer match the owner's `eq(ownerEmail, email)` predicate — the legitimate owner would get 403/404 on their own data. Migrate-before-code guarantees every row is already owned when the new predicates go live.

---

## Rollback

The migration is a single transaction, so a failure mid-apply rolls back automatically — no partial state.

If you need to undo a **successful** apply (e.g., to revert the code deploy):

1. **Revert the code deploy first** (back to the pre-0008 build that tolerates nullable `owner_email`).
2. Then relax the schema:

```sql
BEGIN;
ALTER TABLE "courses"               ALTER COLUMN "owner_email" DROP NOT NULL;
ALTER TABLE "copilot_conversations" ALTER COLUMN "owner_email" DROP NOT NULL;
ALTER TABLE "courses" DROP CONSTRAINT IF EXISTS "uq_courses_grade_subject_year";
ALTER TABLE "courses" ADD CONSTRAINT "uq_courses_grade_subject_year"
  UNIQUE ("grade", "subject", "school_year_id");
COMMIT;
```

> Note: the backfilled `owner_email` values are **not** reverted to NULL — that is intentional and harmless (they are correct; the rows belong to the owner). Rollback only relaxes the constraints so the older code path works again.

Drizzle has no down-migrations; rollback is the manual SQL above. After rollback, remove the `0008` journal entry / snapshot if you intend to regenerate.
