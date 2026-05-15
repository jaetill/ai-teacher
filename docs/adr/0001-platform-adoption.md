# ADR-0001: Platform adoption — ai-teacher

- **Status:** Accepted
- **Date:** 2026-05-13
- **Deciders:** Jason
- **Tags:** platform, adoption

## Context

`ai-teacher` adopts the Agentic Dev Environment platform per `PORT_PLAN_ai-teacher.md` in the platform workspace. This ADR records the project-specific deltas from the platform defaults.

ai-teacher is the third project to adopt the platform after `game-night-pwa` (the reference implementation) and `meal-planner`. It is the **first non-AWS** adopter, so most deltas concentrate around Vercel-vs-AWS infrastructure choices.

## Decision

Adopt all 11 platform standards. The following deltas apply:

### Stack deltas (vs platform default / game-night-pwa)

| Aspect | ai-teacher | Rationale |
|---|---|---|
| Default branch | `main` | Next.js convention |
| Framework | Next.js 16 (App Router) + TypeScript | already in production |
| Frontend deploy | Vercel auto-deploy on push to `main` | no GitHub Actions deploy workflow; Vercel's git integration handles it |
| Backend | Next.js API routes (`src/app/api/`) | no separate Lambda functions |
| Database | Neon Postgres via Drizzle ORM | relational data model |
| Migrations | Drizzle (`drizzle/migrations/`) | not Flyway / Liquibase / raw SQL |
| Auth | NextAuth.js (Google provider) | not Cognito |
| AI | Anthropic SDK direct, server-side streaming | no API Gateway in front |
| Language | TypeScript (strict mode follows project config — not tightened as part of this adoption) | greenfield TS — defer strict-mode tightening |
| Tests | Vitest + @testing-library/react + Playwright (planned, not in initial PR) | matches platform default |

### Tooling deltas

- **ESLint:** existing `eslint.config.mjs` (using `eslint-config-next`) is preserved and **extended**, not replaced. The platform's pragmatic-strict config conflicts with Next.js's linter expectations; extending keeps both happy. See Standard 04.
- **CI:** ai-teacher has no `.github/workflows/` at all. Phase 4 will add CI workflows that act as **gate-keepers** (lint + typecheck + test on PR) — they do **not** deploy. Vercel deploys.
- **Drift detection:** Vercel + Neon don't have an AWS-style "infrastructure drift" model. The `drift-detector` agent is installed but its operational scope is reduced until Phase 6 IaC retrofit (deferred).
- **`AGENTS.md` (root):** a Next.js-version-warning file for AI agents working in this repo (alerts them that this Next.js install may have breaking changes vs. their training data). Not a Claude Agent SDK config; just don't move it.
- **`.agents/skills/` (root):** Google Workspace + Model Armor skill bundles (`gws-*`) used by ai-teacher's own AI subsystem (curriculum import, copilot, etc.). **Do not collapse into `.claude/agents/` or `.claude/skills/`.** Different purpose:
  - `.claude/agents/*.md` — platform subagents Claude Code invokes during a developer session.
  - `.agents/skills/<name>/SKILL.md` — runtime skill bundles consumed by the app's AI features.
- **`.claude/skills/format-curriculum/`:** project-specific Claude skill encoding Heidi's curriculum conventions. Preserved as-is; the platform adoption does not touch `.claude/skills/`.

### Observability deltas

- Sentry: `@sentry/nextjs` (not `@sentry/browser` + `@sentry/aws-serverless`). Auto-wires server-side (API routes) and client-side from one package.
- Logs: Vercel runtime logs (not CloudWatch).
- Source-map upload: Sentry's Next.js plugin handles this in the Vercel build (no separate workflow step).

### IaC deltas (when Phase 6 lands)

- Providers: `vercel/vercel` + `kislerdm/neon` Terraform providers (not AWS).
- Resource count: ~15–25 (Vercel project, env vars, custom domain, Neon project, branches, roles). Substantially smaller than game-night-pwa's 132.
- **Phase 6 is deferred** until a real driver appears (second environment, team usage, or a Vercel-replacement migration).

### User feedback (Phase 7) deltas

- Implementation: Next.js API route `src/app/api/feedback/route.ts` posts to GitHub Issues via Octokit. No Lambda + API Gateway. Same rate-limit caveat (per-instance in-memory map) as game-night-pwa.

## Implementation status (initial PR, 2026-05-13)

- ✅ Phase 1 — Documentation: 11 standards + 13 platform ADRs + ADR template + runbook spec copied; this ADR-0001 + docs/index.md + docs/architecture/overview.md authored fresh
- ✅ Phase 2 — AI configuration: 14 subagents + 10 platform commands + 10 platform hooks added; `AGENTS.md`, `.agents/`, `.claude/skills/format-curriculum/` left untouched; `.claude/settings.json` added (preserves existing `settings.local.json`)
- ⏸ Phase 3 — Quality gates: deferred — needs hands-on extension of existing `eslint.config.mjs` (TypeScript-specific judgment calls per PORT_PLAN)
- ⏸ Phase 4 — CI workflows: deferred — needs Jason's secrets configured + branch protection on `main`
- ⏸ Phase 5 — Observability: deferred — needs Jason to create the Sentry project (Next.js platform) + set Vercel env vars + DSN secret
- ⏸ Phase 6 — IaC retrofit: deferred indefinitely — no current driver (single env, single user, Vercel works)
- ⏸ Phase 7 — User feedback API route: deferred — wait for real users

## Consequences

### Positive

- Same agent pipeline as game-night-pwa and meal-planner. Subagent definitions, slash commands, and hooks are byte-identical to game-night-pwa's verified set.
- Standards docs + ADRs available for reference; no new doc shape to learn.
- `.gitattributes` + `.editorconfig` normalize line endings before any TypeScript / JSON formatting work begins.

### Negative

- Phase 3 ESLint extension is a non-trivial merge between platform pragmatic-strict and `eslint-config-next`. Has to be done by hand.
- Phase 4 CI doesn't exist until secrets are wired — agent-pipeline workflows won't run on PRs until then.
- The "two AI configurations" (`.claude/` platform vs `.agents/skills/` app-runtime + `AGENTS.md` Next.js warning) is novel and easy to confuse. Documented here and in `CLAUDE.md` "Platform inheritance" section.

### Neutral

- No `package.json` changes in this PR. Phase 3 will add ~14 devDependencies.
- No production code touched. This is a tooling + docs adoption only.
- Existing in-flight work on `CLAUDE.md` / `.agents/skills/*` (line-ending normalizations, format-curriculum section additions) sits unstaged in the working tree at branch-creation time. Those are unrelated to this PR and stay where they are.

## Links

- [PORT_PLAN_ai-teacher.md](../../../../Agentic%20Dev%20Environment/PORT_PLAN_ai-teacher.md) — in the platform workspace
- Reference implementations: `https://github.com/jaetill/game-night-pwa`, `https://github.com/jaetill/meal-planner`
