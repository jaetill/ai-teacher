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
- **Hosting**: Vercel (planned)
- **Auth**: TBD (Cognito or NextAuth depending on multi-user needs)
- **Database**: TBD (DynamoDB or Neon/PostgreSQL — data is relational)

## Project status
Early scaffolding. No AWS resources provisioned yet. No deployment pipeline yet.

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

## Deployment (planned)
- Vercel connected to GitHub repo, auto-deploy on push to `main`
- Environment variables: `ANTHROPIC_API_KEY`, database connection string, auth secrets
