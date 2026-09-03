# AI Teacher — Claude Context

## What this app is
A teacher planning and daily operations system. Two subsystems:
- **Planning Intelligence OS** — unit creation, lesson generation, differentiation,
  library management, website/portfolio generation, AI copilot assistant
- **Daily Operations Engine** — student performance ingestion, behavior logging,
  pattern detection, intervention suggestions, parent communication

Initial focus: Planning OS (Curriculum Compiler + Teacher Copilot + Differentiation Engine).
Target user: one teacher (primary), with potential sharing to a small teaching community.

## Tech stack
- **Frontend**: Next.js (App Router) + TypeScript + Tailwind CSS
- **AI**: Claude API (streaming) via Anthropic SDK — conversational copilot experience
- **Observability**: Sentry (`@sentry/nextjs`) — error tracking + performance tracing
- **Hosting**: Vercel — https://ai-teacher-omega-sage.vercel.app
- **Auth**: NextAuth (Google OAuth, Drive scopes; JWT sessions with access-token refresh)
- **Database**: Neon/PostgreSQL via Drizzle ORM (neon-http driver — no interactive
  transactions; use `db.batch()` for atomic multi-statement writes)

## Project status
Live on Vercel. Teacher Copilot (streaming chat) is functional. Other modules are scaffolded but not yet built.

## Source structure (`src/app/`)
Next.js App Router layout — each major module will be a route segment.

```
src/
  app/
    layout.tsx         — root layout, global nav
    page.tsx           — dashboard / home
    api/               — API routes (server-side, replaces separate Lambda functions)
  components/          — shared UI components
  lib/                 — shared utilities, AI client, data access
```

## Core modules (MVP)
| Module | Purpose |
|---|---|
| Curriculum Compiler | Generate unit maps, lesson sequences, pacing guides from standards + theme |
| Teacher Copilot | Conversational AI assistant — rubrics, slides, vocab lists, doc transforms |
| Differentiation Engine | Leveled assignment versions (ELL, SPED, above/below grade) |
| Performance Ingestion | Accept quiz scores, exit tickets, writing samples |
| Communication Engine | Draft parent/admin communications from student data |

## Data model (planned)
- **Student**: id, name, reading_level, accommodations, performance_history, behavior_events
- **Unit**: id, theme, standards[], lessons[], assessments[]
- **Lesson**: id, objectives[], materials[], differentiated_versions{}
- **Assignment**: id, type, difficulty_levels{}, rubric

## AI design
- Conversational interface — teacher "has a conversation" similar to MS Copilot UX
- Streaming responses via Claude API (`anthropic` SDK, `stream: true`)
- Context window carries unit/lesson/student profile data as system context
- No real student data used during development

## Her folders are her units (inviolable)

Stated plainly by Jason, 2026-08-19: **"her folders are her units. plain and simple."**

When a Drive import captures `materials.sourceUnit`, the teacher's own folder names
ARE the unit list. Faithful mode builds units from that list and the AI's only job is
enrichment — lessons, standards, durations, essential questions. Nothing may add,
remove, rename, merge, split or reorder those units. Not the AI. Not a pacing guide.
Not her own year-plan document.

This is not a style preference; it is the rule the app exists to respect, and it has
been broken twice by well-intentioned changes:

- **#680/#682** — a year-plan block told the model the plan was "binding … use ITS
  unit count, unit names" and was appended to the faithful prompt too. Her Grade 6 Q2
  and Q4 built with zero lessons, because the model answered with the plan's unit
  names and the title join to her folder-derived units missed. The year plan is now
  context-only in faithful mode; it keeps authority only in the fallback path, where
  she has no folder structure to honour.
- **#682** — `scanFolderUnits` used the deepest folder as the unit, so
  `Dash Q3/Letters/` produced a unit called "Letters" and Dash never existed. The unit
  is the FIRST folder below the scanned root and stays constant all the way down.

Before changing any build prompt, ask: can this make the model return a unit set that
differs from her folders? If yes, it is wrong regardless of how good the intent is.
Tests pinning this live in `tests/api/import/build-curriculum.test.ts` (faithful mode
must not contain unit-overriding language) and `tests/lib/scan-folder-units.test.ts`.

Corollary: a unit that gets no enrichment must be *reported*, not silently created
empty — see `unmatchedUnits` in the build response.

## Key decisions
- Next.js API routes instead of separate AWS Lambda functions — simpler local dev, easier iteration
- Vercel instead of S3+CloudFront — better fit for Next.js, simpler deploy
- React (not Angular) — better AI codegen support, larger ecosystem, cleaner learning path
- TypeScript from the start — this codebase is more complex than meal-planner

## Deployment
- Vercel project connected to `jaetill/ai-teacher` on GitHub
- **Gated deploy (ADR-0043, live 2026-09-01):** push to `main` → `CI` workflow
  (lint, typecheck, test, `next build`) → on success `deploy-prod.yml` runs
  `vercel deploy --prod` behind the GitHub `production` Environment and polls
  `/api/health`. Vercel git auto-deploy for `main` is OFF via `vercel.json`;
  PR previews still build. Needs `VERCEL_TOKEN` / `VERCEL_ORG_ID` /
  `VERCEL_PROJECT_ID` as `production` Environment secrets — without them
  nothing ships (fail-safe). Runbooks: `docs/runbooks/`.
- Production URL: https://ai-teacher-omega-sage.vercel.app
- Environment variables set in Vercel dashboard: `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SENTRY_DSN`,
  `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
- `ALLOWED_EMAILS` (comma-separated sign-in allowlist) is **required in production** —
  since 2026-09-01 `signIn` fails closed when `VERCEL_ENV=production` and it is unset.
  Unset outside production still means "anyone" so a fresh clone works.
  `AI_RATE_LIMIT_PER_HOUR` (shared per-user AI budget, default 40 calls) and
  `AI_TOKEN_LIMIT_PER_HOUR` (default 2,000,000 billable tokens; charged from real
  `usage` after each call) stay optional.
- **Databases:** production, Vercel Preview and each laptop each get their OWN Neon
  branch. `scripts/lib/db-tools.mjs` refuses `db:reset`/`db:restore` against the
  production host without `--prod`. `.env.example` is the template. See
  `docs/runbooks/database.md`.
- Build-time secrets (Vercel + CI): `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`
- **`ANTHROPIC_API_KEY` belongs to Jason's hotmail Anthropic org (`8a0c287a…`), not the
  jaetill@gmail.com org (`8d63eee8…`) that holds his Claude subscription.** Decided
  2026-09-03: ride the hotmail org's prepaid credit until it runs out; the app detects
  the "credit balance is too low" 400 (`src/lib/anthropic-failure.ts`), raises a fatal
  Sentry issue titled "ACTION NEEDED…", and tells the teacher the feature is paused.
  Swap procedure: `docs/runbooks/ai-billing.md`. Do not "fix" a $0 balance in the
  gmail console — that console has never billed this app. The Claude subscription
  cannot power the copilot for other users (Anthropic terms); the API key is the
  only legitimate path.
- To deploy: `git push origin main` (CI gates it). Manual re-run: Actions → deploy-prod.

## Server-code conventions (2026-07 eval)

- Parse request bodies with `readJson()` and validate ids with `isUuid()` from
  `src/lib/api-utils.ts` — never call `req.json()` bare or pass unvalidated ids to Postgres.
- Every Anthropic-calling route must call `checkAiRateLimit(email)` (`src/lib/rate-limit.ts`)
  after auth and cheap validation, before any AI spend — and `recordAiUsage(...)`
  (`src/lib/ai-usage.ts`) with `message.usage` afterwards. That writes the
  `ai_interactions` row and charges the token budget; `tests/lib/ai-usage.test.ts`
  fails if a `getAnthropic()` route skips it. The copilot records onto
  `copilot_messages.token_count_*` instead and calls `chargeAiTokens` directly.
  Cost query: see the header comment in `src/db/schema/ai-interactions.ts`.
- The copilot's `system` is a content-block array with `cache_control: ephemeral`
  on the base-prompt + curriculum block (identical across turns; tens of thousands
  of tokens). Keep per-turn text (attachment guard, page context) in the second
  block so it never invalidates the cached prefix.
- Get the Anthropic client via `getAnthropic()` (`src/lib/anthropic.ts`) — never construct
  `new Anthropic()` at module scope (breaks builds where the key env var is scoped).
- Atomic multi-statement writes use `db.batch([...])`; `db.transaction()` throws on the
  neon-http driver.
- **Never return a bare Response for a 5xx, or for a size/limit refusal.** Use
  `apiError(ROUTE, status, reason, message, { cause, detail })` (JSON `{error}`) or
  `refuse()` (plain text) from `src/lib/error-log.ts`: both write a row to
  `error_events`, and any 5xx is also `Sentry.captureException`'d with the `cause`.
  `tests/api/no-bare-5xx.test.ts` fails the build if a `status: 5xx` appears without
  one of them nearby. Plain 400/404 contract errors may stay bare. Each call needs a
  stable `reason` code — never reword an existing one; grouping across releases depends
  on it. `detail` holds counts, byte sizes and limits **only** — never message text,
  filenames, or file contents. `GET /api/health` is the unauthenticated liveness check.

  Why this exists: on 2026-08-30 a copilot turn returned 413 and the panel replaced the
  server's sentence with "Something went wrong." Vercel logs the status code but not the
  body, and six separate guards on that route return 413 — so which one fired could only
  be narrowed by elimination, never confirmed. Triage now starts here:

  ```sql
  select created_at, route, status, reason, message, detail
  from error_events order by created_at desc limit 20;
  ```
- Migrations: 0007_platform_scope.sql consolidates the former hand-written 0007–0010
  (which had broken journal timestamps and no snapshots). Always create migrations with
  `drizzle-kit generate` — never hand-write SQL + journal entries.

---

## Platform inheritance

This project adopts the Agentic Dev Environment platform (initial PR 2026-05-13). Standards live in `docs/standards/`, ADRs in `docs/adr/`. Project-specific deviations are in [docs/adr/0001-platform-adoption.md](docs/adr/0001-platform-adoption.md).

### Three AI surfaces — don't confuse them

1. **`.claude/agents/` + `.claude/commands/` + `.claude/hooks/`** — platform tooling Claude Code uses during a developer session (subagents like `code-reviewer`, slash commands like `/review`, hook scripts that gate Bash commands). Stack-agnostic; copied from the Agentic Dev Environment platform.
2. **`.claude/skills/format-curriculum/`** — project-specific Claude skill encoding Heidi's curriculum conventions. **Preserved as-is.** Don't move it; don't overwrite it.
3. **`.agents/skills/<name>/SKILL.md`** — Google Workspace + Model Armor skill bundles the app consumes at runtime. **Preserved as-is.** Different lifecycle from `.claude/`.

`AGENTS.md` at the repo root is a Next.js-version-warning file — leave it alone.

### What's installed (initial PR)

- 14 specialist subagents at `.claude/agents/` (architect, code-reviewer, dep-watcher, doc-keeper, drift-detector, e2e-tester, functional-tester, iac-implementer, implementer, incident-responder, release-captain, security-reviewer, test-writer, triage-bot)
- 10 platform slash commands at `.claude/commands/`
- 10 hook scripts at `.claude/hooks/` (auto-format, block-credential-exposure, block-destructive-bash, block-protected-paths, audit-bash, check-clean-stop, confirm-pii-edits, inject-context, inject-session-context, lint-warn) + their `README.md`
- Mixed-strictness hook policy in `.claude/settings.json`
- Existing `.claude/settings.local.json` (Jason's per-machine allow-list) preserved

Several agent prompts use AWS/Lambda examples copied verbatim from game-night-pwa. They function for ai-teacher's Vercel/Neon stack but the *illustrative* content is AWS-flavored. Adapting the examples for Next.js is a follow-up — not a blocker for use.

### Platform phase status (refreshed 2026-07-31, #625)

See `docs/adr/0001-platform-adoption.md` for what each phase is.

- ~~Phase 3 (quality gates)~~ — DONE (Prettier, vitest, Playwright, husky,
  commitlint, lint-staged, gitleaks all installed and wired; `src/` is
  prettier-ignored and converges via lint-staged on touch)
- ~~Phase 4 (CI)~~ — DONE 2026-09-01: CI (incl. `next build`) required on PRs
  (6 required checks are the `review / *` jobs), `deploy-prod.yml` is the only
  path to production (#618). #619's empty-commit nudge is moot now that Vercel
  no longer watches `main`.
- Phase 6 (IaC retrofit) — deferred; not needed on Vercel/Neon today.
- ~~Phase 7 (user-feedback API route)~~ — DONE (feedback widget + Postgres
  rate-limited API route, ADR-0046).
