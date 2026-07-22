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

## Key decisions
- Next.js API routes instead of separate AWS Lambda functions — simpler local dev, easier iteration
- Vercel instead of S3+CloudFront — better fit for Next.js, simpler deploy
- React (not Angular) — better AI codegen support, larger ecosystem, cleaner learning path
- TypeScript from the start — this codebase is more complex than meal-planner

## Deployment
- Vercel project connected to `jaetill/ai-teacher` on GitHub
- Auto-deploys on push to `main`
- Production URL: https://ai-teacher-omega-sage.vercel.app
- Environment variables set in Vercel dashboard: `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SENTRY_DSN`,
  `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
- Optional hardening env vars (2026-07 eval): `ALLOWED_EMAILS` (comma-separated sign-in
  allowlist — SET THIS IN PROD; unset means any Google account can sign in and spend
  Anthropic tokens) and `AI_RATE_LIMIT_PER_HOUR` (shared per-user AI budget, default 40)
- Build-time secrets (Vercel + CI): `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`
- To deploy: `git push origin main`

## Server-code conventions (2026-07 eval)

- Parse request bodies with `readJson()` and validate ids with `isUuid()` from
  `src/lib/api-utils.ts` — never call `req.json()` bare or pass unvalidated ids to Postgres.
- Every Anthropic-calling route must call `checkAiRateLimit(email)` (`src/lib/rate-limit.ts`)
  after auth and cheap validation, before any AI spend.
- Get the Anthropic client via `getAnthropic()` (`src/lib/anthropic.ts`) — never construct
  `new Anthropic()` at module scope (breaks builds where the key env var is scoped).
- Atomic multi-statement writes use `db.batch([...])`; `db.transaction()` throws on the
  neon-http driver.
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

### What's NOT installed yet

Phase 3 (quality gates), Phase 4 (CI workflows), Phase 6 (IaC retrofit), Phase 7 (user-feedback API route) — all deferred. See `docs/adr/0001-platform-adoption.md` for the deferral reasons and what each phase needs from Jason.

Active gaps before the platform is "fully on":
- ~~Phase 3~~ — DONE (Prettier, vitest, Playwright, husky, commitlint, lint-staged,
  gitleaks all installed and wired; `src/` is prettier-ignored and converges via
  lint-staged on touch)
- Phase 4 — add `.github/workflows/ci.yml` + the platform agent workflows; configure repo secrets (`CLAUDE_CODE_OAUTH_TOKEN`, `SENTRY_*`, etc.); enable branch protection on `main`

Each phase is its own PR.
