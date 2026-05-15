# ai-teacher documentation

This directory follows the Agentic Dev Environment platform layout.

## Layout

- `standards/` — the 11 platform standards (source-control, CI/CD, testing, quality-gates, documentation, observability, secrets, IaC, release-management, AI-workflows, user-feedback). Copied verbatim from the platform. Project-specific deltas live in [adr/0001-platform-adoption.md](adr/0001-platform-adoption.md).
- `adr/` — Architecture Decision Records. Two prefix conventions live here:
  - `0001-platform-adoption.md` — this project's adoption of the platform, with all project-specific deltas (Next.js, Vercel, Neon, NextAuth, etc.).
  - `0001-platform-foundations.md` through `0013-grafana-cloudwatch-pull.md` — the platform's foundational ADRs, copied verbatim. They explain *why* the standards say what they say.
- `runbooks/` — operational playbooks. Format spec in [runbooks/README.md](runbooks/README.md). Runbooks accumulate as operations stabilize; treat this directory as initially empty.
- `architecture/` — system overviews (high-level diagrams, module boundaries).

## How to use this

- Need to know how something should be done? Read `standards/`.
- Want to know why a decision was made? Read `adr/`.
- Need to run a recurring operation? Read `runbooks/`.
- New here? Start with [adr/0001-platform-adoption.md](adr/0001-platform-adoption.md).
