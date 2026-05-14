# Architecture overview — ai-teacher

## What this is

A teacher planning + daily-operations system. Two subsystems:

- **Planning Intelligence OS** — unit creation, lesson generation, differentiation, library management, website/portfolio generation, AI copilot.
- **Daily Operations Engine** — student performance ingestion, behavior logging, pattern detection, intervention suggestions, parent communication.

MVP focus: Planning OS (Curriculum Compiler + Teacher Copilot + Differentiation Engine).

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 (App Router) | TypeScript throughout |
| UI | React + Tailwind CSS | shadcn-style component patterns |
| Hosting | Vercel | auto-deploy on push to `main`; preview deploys on PRs |
| API | Next.js API routes (`src/app/api/`) | no separate Lambda functions |
| AI | Anthropic SDK (streaming) | server-side; `ANTHROPIC_API_KEY` in Vercel env |
| Auth | NextAuth.js | Google provider; session-based |
| Database | Neon Postgres | accessed via Drizzle ORM |
| Migrations | Drizzle | files in `drizzle/migrations/` |
| App AI subsystem | Anthropic SDK + project skill bundles | `.agents/skills/<name>/SKILL.md` defines reusable runtime skills (Google Workspace, Model Armor) the app's AI features consume |

## Module boundaries

```
src/
  app/
    layout.tsx          — root layout (nav, providers)
    page.tsx            — dashboard
    api/                — server-side API routes
      curriculum/       — curriculum editor data + mutations
      auth/             — NextAuth handler
      copilot/          — streaming chat with Claude
    curriculum/         — curriculum UI (edit, view)
    copilot/            — teacher copilot UI
  components/           — shared React components
    curriculum-editor/  — drag-and-drop curriculum editor
  lib/                  — shared utilities, AI client, DB access
  types/                — shared TypeScript types
drizzle/
  migrations/           — generated migration SQL
  schema.ts             — Drizzle schema definitions
.agents/
  skills/               — Google Workspace + Model Armor skills (gws-*)
.claude/
  agents/               — platform subagents (architect, reviewer, etc.)
  commands/             — platform slash commands
  hooks/                — platform hooks (auto-format, security gates, etc.)
  skills/               — project-specific Claude skills (e.g. format-curriculum)
```

## Three AI surfaces side-by-side

ai-teacher carries three distinct AI configurations. Easy to confuse — the names overlap:

1. **`.claude/agents/` + `.claude/commands/` + `.claude/hooks/` — platform tooling.** Subagents Claude Code can invoke during a developer session (`code-reviewer`, `architect`, etc.) and slash commands developers run interactively (`/review`, `/adr`, etc.). Sourced from the Agentic Dev Environment platform; stack-agnostic.

2. **`.claude/skills/format-curriculum/` — project-specific Claude skill.** Encodes Heidi's curriculum conventions (8 material types, 3 attachment roles, VA SOL 2024 ID format, Drive folder categories). Lives under `.claude/skills/` by Claude Code convention but is project-specific authoring tooling. **Don't move it; don't overwrite it.**

3. **`.agents/skills/<name>/SKILL.md` — app-runtime skill bundles.** Google Workspace (`gws-gmail`, `gws-drive`, `gws-classroom`, ...) and Model Armor skill bundles consumed by ai-teacher's own AI features at runtime (curriculum import, copilot). Different lifecycle from `.claude/`.

`AGENTS.md` at the repo root is a separate (very short) thing — just a heads-up to AI agents that this Next.js install may have breaking changes vs. their training data. Not a skill, not a config; leave it where it is.

## Deployment

- Vercel project linked to `jaetill/ai-teacher` on GitHub.
- Push to `main` → Vercel builds + deploys to production.
- PR open → Vercel builds a preview deployment.
- Environment variables managed in Vercel dashboard (will be moved into Terraform if/when Phase 6 IaC retrofit lands).

## Data flow (Curriculum Compiler)

1. Teacher uploads source documents → `src/app/api/curriculum/import/`.
2. Drive import or upload writes to Neon via Drizzle.
3. AI classification (Anthropic SDK, server-side) tags content with material type + role per `.claude/skills/format-curriculum/`.
4. Teacher refines via drag-and-drop UI (`src/components/curriculum-editor/`).
5. Mutations flow through `/api/curriculum/editor/update-material/` etc.

## Live URL

https://ai-teacher-omega-sage.vercel.app
