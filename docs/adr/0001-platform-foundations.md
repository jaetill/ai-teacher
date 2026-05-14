# ADR-0001: Platform foundations

- **Status:** Accepted
- **Date:** 2026-05-08
- **Deciders:** Jason
- **Tags:** platform, foundations, ai-workflows

> Format: MADR 4.x with extensions (Neutral consequences, Implementation notes, Bundled sub-decisions where applicable). See `template.md`.

## Context and Problem Statement

Solo developers tend to skip practices a mature team treats as table stakes — peer review, ADRs, coverage gates, runbooks, structured logging — because the marginal cost falls on one person, and that person is also writing features. The skipped cost isn't zero: it compounds across projects, makes onboarding a future collaborator (or future-self after a 6-month gap) painful, and produces a portfolio that's harder to talk about in interviews than it should be.

The question: what structural shape lets a solo developer maintain mature-team practices across a multi-project portfolio without being personally responsible for the per-project execution labor?

## Decision Drivers

- **Time.** Cannot manually run a full mature-team checklist on every commit.
- **Consistency.** Multiple projects → standards must be defined once and propagated, not re-derived per project.
- **Portfolio value.** Practices applied to real projects double as interview talking points; the *shape* of how the practices are operated is itself a portfolio artifact.
- **AI capability.** Modern AI tooling (Claude Code, subagents, hooks, skills, GitHub Actions + AI review) can absorb most of the labor a mature team's process would otherwise require.
- **Retrofit pressure.** Existing projects need to come into the platform later; the platform shape must support retrofit, not just greenfield.

## Considered Options

- Option A: Per-project ad-hoc — each project decides its own standards as needed
- Option B: Single-template scaffold — one boilerplate repo, new projects copied from it, no central platform
- Option C: Two-layer platform — meta-environment with standards, ADRs, AI configuration, and per-stack templates; projects derived from templates inherit the platform's AI workflows

## Decision Outcome

Chosen option: **Option C — two-layer platform**, because the stated goal is "as mature as possible, with AI doing the heavy lifting." That goal is incompatible with A or B — both leave too much execution work on the human. A meta-environment with shared AI infrastructure is the only structure where the per-project marginal cost is mostly approval, not authorship.

The platform will:

1. Capture standards as code in `docs/standards/`, with ADRs in `docs/adr/` recording every non-trivial decision.
2. Host the canonical AI team configuration in `templates/_shared/claude/` (agents, hooks, skills, commands), propagated to each project's runtime `.claude/` directory at scaffold time.
3. Provide per-stack templates (`python-service`, `typescript-app`, `aws-iac`) wiring all gates by default.
4. Expose reusable GitHub Actions workflows so server-side enforcement mirrors local hooks.
5. Live as a public GitHub repo, doubling as a portfolio piece.

## Consequences

### Positive

- Standards are debatable, version-controlled, and propagable.
- New projects start fully wired (CI, gates, AI agents, runbooks) without per-project setup labor.
- The platform itself is a tangible artifact for interviews — "here's how I run my own engineering practice."
- Future-self can read ADRs to recover *why* decisions were made, not just *what*.

### Negative

- Upfront cost: 10 standards to research and decide before templates can be built.
- Risk of over-engineering for projects that don't need full mature-team treatment. Mitigation: templates are the floor, not the ceiling — small projects can opt out of components.
- Retrofitting existing projects is deferred and will be its own workstream; standards changes during the build phase may make retrofit harder later.

### Neutral

- The platform requires its own discipline (CI, ADRs, etc. for the platform itself), not just the projects on top of it. Eat the dogfood.

## Pros and Cons of the Options

### Option A: Per-project ad-hoc

Each project decides its own standards as needed. Maximum flexibility, lowest discipline.

- ✅ No upfront cost; projects adopt the right tools per stack with no constraints.
- ❌ Inconsistency across portfolio.
- ❌ Standards drift; decisions are forgotten or re-litigated.
- ❌ No leverage from work done on prior projects.
- 💰 Cost: low upfront, high ongoing.

### Option B: Single-template scaffold

One cookiecutter or boilerplate repo. New projects copied from it. No central platform — the template *is* the standard.

- ✅ Simple, concrete. New projects start consistent.
- ❌ No way to update existing projects when standards evolve.
- ❌ Templates rot.
- ❌ Hard to support multiple stacks (Python, TS, AWS IaC) cleanly.
- ❌ No place for the AI team to live.
- 💰 Cost: medium upfront, medium ongoing.

### Option C: Two-layer platform — chosen

A meta-environment containing standards docs, ADRs, AI configuration, and per-stack templates. Projects derive from templates and inherit the platform's AI workflows. The meta-env is itself a public GitHub repo.

- ✅ Standards are a first-class artifact — version-controlled, debatable via PR.
- ✅ AI team is shared infrastructure, not duplicated.
- ✅ Multi-stack support is clean (one template per stack).
- ✅ The meta-env *is* a portfolio piece in addition to the projects built on it.
- ❌ Higher upfront cost.
- ❌ Discipline required to update the platform rather than diverge in projects.
- ❌ Retrofitting existing projects is a non-trivial separate workstream.
- 💰 Cost: high upfront, low ongoing (especially as AI absorbs the platform maintenance labor too).

## Implementation notes

- Skeleton built 2026-05-08. Standards docs were placeholders pending per-decision research; many are now decided.
- Decision queue and ordering: see [`docs/standards/index.md`](../standards/index.md).
- Canonical subagent definitions live in `templates/_shared/claude/` and propagate to project runtime `.claude/` via the bootstrap script. The roster (currently 12 specialists) is documented in `templates/_shared/claude/README.md`.
- The platform's own root-level `.claude/` is intentionally not authored by AI agents (write-protected); the source-of-truth/runtime split is the design, not a workaround.

## Links

- Lencioni, *Working Genius* — informs the "AI does execution, human does Wonder + Discernment" division.
- Nygard, *Documenting Architecture Decisions* (2011) — origin of the ADR format.
- [MADR 4.x](https://adr.github.io/madr/) — the format adopted by ADR-0008 and applied to all ADRs going forward.
- The `engineering:*` plugin skills (architecture, code-review, debug, etc.) — already-installed foundation built upon.
