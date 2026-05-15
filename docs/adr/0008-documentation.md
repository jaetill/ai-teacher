# ADR-0008: Documentation Format, Hosting, and ADR Standard

- **Status:** Accepted
- **Date:** 2026-05-08
- **Deciders:** Jason
- **Tags:** documentation, adr, mkdocs, github-pages, madr

> Format: MADR 4.x (bundled sub-decisions form). See `template.md`.

## Context and Problem Statement

The platform has been producing documentation artifacts since ADR-0001 — standards docs, ADRs, READMEs, runbooks. The format and conventions have been informal up to this point. With seven ADRs already written and the documentation site about to become a portfolio piece, the format and hosting decisions need formalizing.

The question: which documentation format, hosting model, ADR standard, and AI-maintenance pattern give a solo developer a docs corpus that stays current without manual upkeep and reads as a portfolio artifact?

This ADR bundles five sub-decisions because hosting choice constrains build pipeline, ADR format choice ripples into existing ADR retrofit, and doc-keeper scope depends on the others.

## Decision Drivers

- **Job-search portfolio relevance.** A polished public docs site is a real signal to employers; the user explicitly raised this during proposal review and weighted it accordingly.
- **AI does the maintenance.** The cost of "more documentation infrastructure" is mostly absorbed by the `doc-keeper` agent + auto-generation tooling; raw human-labor cost shouldn't dominate the decision.
- **Existing ADR corpus.** Seven ADRs have been written using a Nygard/MADR-hybrid format. Switching to formal MADR creates ~30 min of mechanical retrofit but produces internal consistency and standards conformance.
- **Performance budgets** (per ADR-0007). Docs build must not penalize commits that don't touch docs. Path filters required.
- **Documentation rot.** Hand-maintained docs always rot. The standard must lean heavily on auto-generation and AI-assisted upkeep.

## Considered Options

The bundle has five sub-decisions:

- **Sub-decision 1 — Documentation home:** chose **In-repo + GitHub Pages with MkDocs Material**
- **Sub-decision 2 — ADR format:** chose **MADR 4.x with three documented extensions**
- **Sub-decision 3 — Runbook format:** chose **Tight 6-section** (When/Prereqs/Steps/Verify/Rollback/Escalation)
- **Sub-decision 4 — API documentation:** chose **Per-stack auto-generation**
- **Sub-decision 5 — Doc-keeper triggers:** chose **On merge to main; updates current truth; doesn't author from scratch**

## Decision Outcome

We adopt:

1. **Documentation home:** Every project gets a published GitHub Pages site built from `docs/` with MkDocs Material on every merge to `main`. Docs source remains in-repo as markdown.
2. **ADR format:** MADR 4.x with three documented extensions (Neutral consequences, Implementation notes, Bundled sub-decisions). All seven prior ADRs are retrofitted to match (Task #18). Going forward, all ADRs follow this format.
3. **Runbook format:** Tight 6-section: When / Prereqs / Steps / Verify / Rollback / Escalation. Required runbooks per project: deploy, rollback, secret-leak, iac-recover, incident-response.
4. **API documentation:** Per-stack auto-generation (FastAPI Swagger / Sphinx / TypeDoc / OpenAPI). Hand-maintained API docs are forbidden.
5. **Doc-keeper agent:** Triggers on merge to main; maintains current-truth docs (READMEs, navigation, cross-links, badges); does not author runbooks/ADRs from scratch (head agent's job).
6. **Diagrams:** Mermaid as the platform default (renders in GitHub markdown and MkDocs).
7. **CLAUDE.md** budget: ≤ 200 lines per project.

## Consequences

### Positive

- **Portfolio signal.** A polished MkDocs Material site at a public URL is recognizable and credibility-building.
- **MADR conformance.** ADRs follow an industry-standard format that any reviewer recognizes immediately.
- **Documentation that doesn't rot** because it's auto-generated where possible (API docs) and AI-maintained where not (READMEs, navigation, cross-links).
- **Honest gap acknowledgement.** ADR-0005's "code-quality enforcement gap" pattern is generalized: this standard explicitly names what doc-keeper does NOT do (author from scratch), so future-self knows where the gap lives.
- **The platform's own docs site** doubles as a portfolio piece — the platform's standards, ADRs, and architecture become directly readable rather than living in a private repo.

### Negative

- **Retrofit cost.** Seven existing ADRs needed to be brought into formal MADR 4.x. Mechanical work, ~30 min, but it had to happen.
- **MkDocs Material setup.** ~20 min one-time per project. Templates absorb most of this.
- **GitHub Pages adds a build pipeline.** ~30s per merge to main; gated by path filters so it doesn't fire on code-only PRs.

### Neutral

- The MADR extensions (Neutral consequences, Implementation notes, Bundled sub-decisions) are common-enough variations that calling our format "MADR 4.x with three extensions" is honest and recognizable.
- Switching from a different docs generator later (e.g., Docusaurus) is mechanical — markdown source is portable.
- A future collaborator joining the project will need to learn MkDocs Material's `mkdocs.yml`. Standard tooling, well-documented.

## Pros and Cons of the Options

### Sub-decision 1: Documentation home

| Option | Trade-off |
|---|---|
| **In-repo markdown only** | Zero build pipeline; renders fine on GitHub. No polished presentation; weaker portfolio signal. |
| **In-repo + GitHub Pages with MkDocs Material** (chosen) | Polished public site; portfolio-grade; auto-deploys via Action; ~20 min one-time setup. |
| **Hosted docs platform** (Mintlify, Vercel) | Best UX; ongoing cost or vendor lock-in; overkill at solo scale. |
| **Combination** (in-repo for narrative, GH Pages for generated API docs) | Best of both; two pipelines to maintain. |

The user's pushback during proposal review explicitly weighted the portfolio signal of GitHub Pages, flipping the recommendation from "in-repo only" to "GitHub Pages by default."

### Sub-decision 2: ADR format

| Option | Trade-off |
|---|---|
| **Nygard original** (Status / Context / Decision / Consequences) | Concise; doesn't capture options-considered explicitly; tradeoffs disappear. |
| **MADR 4.x** (chosen, with three extensions) | Most popular modern variant; portfolio-recognizable; explicit options + pros/cons. |
| **Custom Nygard/MADR hybrid** (what we had been writing) | Captures sub-decisions cleanly via tables; not industry-standard so weaker portfolio signal. |

The choice tipped during user review: "if MADR is the current popular choice we should consider using that instead." MADR is more recognizable; the retrofit cost is bounded.

### Sub-decision 3: Runbook format

| Option | Trade-off |
|---|---|
| **Tight 6-section** (chosen) | Predictable structure; easy to scan under stress; forces the rollback question. |
| **Free-form prose** | Maximum flexibility; reader has to hunt for what they need under pressure. |
| **Heavy templates** (Atlassian-style with metadata, severity, labels) | Comprehensive; templates become barriers; time-consuming to write. |

### Sub-decision 4: API documentation

| Option | Trade-off |
|---|---|
| **Hand-maintained markdown** | Maximum control; rots in days; documentation drifts from implementation. |
| **Per-stack auto-generation** (chosen) | Truth lives in code; doc updates are automatic; per-stack tooling is industry-default. |
| **Single tool across all stacks** | Simpler conceptually; no good cross-stack option exists. |

### Sub-decision 5: Doc-keeper triggers

| Option | Trade-off |
|---|---|
| **On every PR** | Rapid feedback; PRs become noisy with doc churn. |
| **On merge to main** (chosen) | Updates current-truth docs after the decision is final; cleaner separation of draft vs published. |
| **Scheduled (daily/weekly)** | Less frequent churn; longer drift window between code and docs. |

## Implementation notes

- Standards doc: [`docs/standards/05-documentation.md`](../standards/05-documentation.md).
- ADR template: [`docs/adr/template.md`](template.md) — MADR 4.x with three extensions documented.
- Reusable workflow: `workflows/docs.yml` — MkDocs Material build + GitHub Pages deploy. Path-filtered.
- Existing ADRs (0001–0007): retrofitted to MADR 4.x as part of Task #18 (completed alongside this ADR).
- The platform's own docs site: enabled as part of this ADR. Site URL pattern: `https://<github-username>.github.io/<repo-name>/`.
- The `doc-keeper` agent's system prompt operationalizes the trigger table in §8 of the standards doc; authored as part of ADR-0011 (AI workflows).

## Links

- [MADR 4.x](https://adr.github.io/madr/) — adopted ADR format.
- [MkDocs Material](https://squidfunk.github.io/mkdocs-material/) — chosen docs generator.
- [Mermaid](https://mermaid.js.org/) — diagram format.
- [FastAPI documentation](https://fastapi.tiangolo.com/) — exemplary use of MkDocs Material for technical docs.
- [Sphinx](https://www.sphinx-doc.org/), [TypeDoc](https://typedoc.org/) — language-specific API doc generators.
- ADR-0001 (Platform foundations) — establishes that docs are a first-class artifact.
- ADR-0003 (CI/CD) — defines ADR-gated change categories that drive ADR triggers.
- ADR-0005 (Quality gates) — defines comment policy that complements doc strategy.
- ADR-0007 (IaC) — established the path-filter performance discipline applied here.
