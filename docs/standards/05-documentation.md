# Standard 05 — Documentation

**Status:** 🟩 Decided (2026-05-08)
**ADR:** [ADR-0008](../adr/0008-documentation.md)

How documentation is structured, hosted, generated, and maintained. The principle: documentation that doesn't auto-update from the source it describes will rot. Most documentation labor is therefore AI-managed via the `doc-keeper` subagent and per-stack auto-generation tooling.

## Summary

| Concern | Choice |
|---|---|
| Documentation home | In-repo markdown + **GitHub Pages with MkDocs Material** for every project |
| ADR format | **MADR 4.x with three extensions** (Neutral consequences, Implementation notes, Bundled sub-decisions) |
| Runbook format | Tight 6-section: When / Prereqs / Steps / Verify / Rollback / Escalation |
| API documentation | Per-stack auto-generation (FastAPI Swagger / Sphinx / TypeDoc / OpenAPI) |
| Diagrams | Mermaid (renders inline in GitHub markdown and MkDocs) |
| Doc-keeper triggers | On merge to main; updates current-truth docs; doesn't author from scratch |

## 1. Documentation home — GitHub Pages with MkDocs Material

Every project gets a published documentation site. The site is built from the project's `docs/` directory using **MkDocs Material** and deployed to GitHub Pages on every merge to `main`.

### Why MkDocs Material

- Industry recognition: used by FastAPI, Pydantic, Kubernetes, and many other technical projects. A reader recognizes the styling immediately as a serious technical doc site.
- Out-of-the-box features: search, dark mode, code annotations, Mermaid rendering, mobile-friendly, navigation tree from filesystem.
- Build is fast (~30s for typical project sizes) and runs on merge to main, not on PR — no per-commit cost.
- Setup is ~20 min one-time per project; the bootstrap script generates the initial `mkdocs.yml`.

### Structure

```
project-repo/
├── docs/
│   ├── index.md                  ← landing page; usually mirrors README's intro
│   ├── getting-started.md
│   ├── architecture/
│   │   └── overview.md           ← high-level system shape; entry point for ADRs
│   ├── adr/
│   │   ├── index.md              ← list of ADRs with status
│   │   ├── 0001-...md
│   │   └── ...
│   ├── runbooks/
│   │   ├── index.md
│   │   ├── deploy.md
│   │   ├── rollback.md
│   │   └── ...
│   ├── api/                      ← auto-generated; gitignored where possible
│   │   └── ...
│   └── standards/                (only in this platform repo; not in scaffolded projects)
├── mkdocs.yml                    ← navigation + theme config
└── .github/workflows/docs.yml    ← build + deploy on merge to main
```

### `mkdocs.yml` template

```yaml
site_name: <Project Name>
site_url: https://<github-username>.github.io/<project-name>/
repo_url: https://github.com/<github-username>/<project-name>
edit_uri: edit/main/docs/

theme:
  name: material
  features:
    - content.code.copy
    - content.code.annotate
    - navigation.tabs
    - navigation.sections
    - navigation.tracking
    - search.highlight
    - toc.follow
  palette:
    - media: "(prefers-color-scheme: light)"
      scheme: default
      toggle: { icon: material/weather-night, name: Switch to dark mode }
    - media: "(prefers-color-scheme: dark)"
      scheme: slate
      toggle: { icon: material/weather-sunny, name: Switch to light mode }

markdown_extensions:
  - admonition
  - pymdownx.details
  - pymdownx.highlight
  - pymdownx.inlinehilite
  - pymdownx.snippets
  - pymdownx.superfences:
      custom_fences:
        - name: mermaid
          class: mermaid
          format: !!python/name:pymdownx.superfences.fence_code_format
  - pymdownx.tabbed:
      alternate_style: true
  - tables
  - toc:
      permalink: true

# nav: maintained by doc-keeper agent based on filesystem
```

### Deploy workflow

`.github/workflows/docs.yml` (referenced from the platform's reusable workflow):

```yaml
name: docs
on:
  push:
    branches: [main]
    paths: ['docs/**', 'mkdocs.yml', '.github/workflows/docs.yml']

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }
      - run: pip install mkdocs-material mkdocs-mermaid2-plugin
      - run: mkdocs build
      - uses: actions/upload-pages-artifact@v3
        with: { path: site }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Path filter: only runs when `docs/`, `mkdocs.yml`, or the workflow itself changes. Code-only PRs don't trigger doc builds.

### The platform's own docs site

This repo (Agentic Dev Environment) gets its own `https://<username>.github.io/agentic-dev-environment/` site showing:

- README content as landing
- All standards
- All ADRs
- Architecture overview
- Runbooks (when applicable)

That site is itself a portfolio piece.

## 2. ADR format — MADR 4.x with three documented extensions

### Format choice

[MADR 4.x](https://adr.github.io/madr/) is the de facto modern standard, used by Spring, Arc42, OpenSearch, and many OSS projects. It's a Markdown-native ADR format that improves on Nygard's original by separating "Considered Options" (just a list) from "Pros and Cons of the Options" (the analysis, presented after the Decision Outcome so readers see the conclusion first).

### Three documented extensions to MADR

The platform's ADRs follow MADR 4.x with three extensions:

1. **Neutral consequences** — a third bucket alongside Positive and Negative. The "what changes but isn't strictly better or worse" cases. Forces the question to be considered.
2. **Implementation notes** — a section between Decision Outcome and Links, pointing to the operational artifacts (standards docs, code, configs) that make the decision real.
3. **Bundled sub-decisions** — when multiple related decisions are tightly coupled, they live in a single ADR. Each sub-decision gets its own subsection in `Pros and Cons of the Options`. The Decision Outcome captures the bundle.

The template is at [`docs/adr/template.md`](../adr/template.md).

### When to write an ADR

| Required | Strongly recommended | Not needed |
|---|---|---|
| Any change in the 5 ADR-gated categories (per ADR-0003): destructive migrations, new external deps/services, security-relevant changes, API contract changes, schema changes | Decisions where future-you would reasonably ask "why was this done this way?" | Routine bug fixes |
| Introducing a new tool, technology, framework, or service | Non-trivial architectural patterns ("use event sourcing here") | Refactors that don't change architecture |
| | Cross-cutting standards changes | Dependency version bumps |

### When ADR drafting happens

- **In conversation** with the human (head agent in architect mode): when a decision is being deliberated as part of design discussion.
- **Headlessly** (`architect` subagent): when an ADR-gated PR is opened autonomously, the subagent reads the diff and drafts a paired ADR for human review.

### ADR statuses

`Proposed` → `Accepted` | `Rejected` | `Deprecated` | `Superseded by ADR-NNNN`

Status changes are committed with the ADR file. A `Deprecated` or `Superseded` ADR remains in the repo (history matters); a header comment in the new ADR cross-links the old one.

### ADR numbering

ADRs are numbered in **creation order**, not by topic. ADR-0001 is the first ADR; ADR-NNNN is the Nth. This is the standard practice. The standards index records which ADR corresponds to which standard.

## 3. Runbook format — tight 6-section

Runbooks are read in stress (something broken at 2am or the equivalent solo case). Format prioritizes scan-ability over completeness.

### Required structure

```markdown
# Runbook: <name>

## When to use this
Trigger conditions in 1–3 sentences. Be specific: not "when something is broken" but "when the dev environment's deploy step fails with X."

## Prerequisites
What's needed before starting:
- Open consoles / dashboards
- Installed CLI / authenticated to which environment
- Access permissions required

## Steps
1. Numbered. Copy-pasteable. Idempotent where possible.
2. Each step states what success looks like inline ("you should see X").
3. Each step that can fail says what failure looks like and routes to the rollback or escalation section.

## Verification
Specific checks (not "looks good"):
- HTTP 200 response from `/health`
- No `5xx` errors in last 5 minutes per CloudWatch
- Database migration table shows expected version

## Rollback
How to undo if it went wrong:
- The reversal procedure
- What to do if the reversal itself fails (this is the escalation case)
- Acceptable end state — what's "safely undone"

## Escalation
Who/what to notify if stuck. For solo: this is the human. Specify *which channel* (incident-responder agent triggers a page, vs digest mention, vs just an issue).
```

### Required runbooks per project (defaults)

The bootstrap script generates these from templates:

| Runbook | Purpose |
|---|---|
| `deploy.md` | Manual deploy procedure (for when auto-deploy is bypassed) |
| `rollback.md` | Manual rollback (for when auto-rollback failed) |
| `secret-leak.md` | What to do when a secret leaks (per ADR-0006) |
| `iac-recover.md` | State file lost / corrupted recovery (per ADR-0007) |
| `incident-response.md` | The general "something is broken in prod" procedure |

Project-specific runbooks: any operational procedure that's been done twice should be a runbook the third time. The `doc-keeper` agent monitors for repeated procedural questions in issues and proposes new runbooks.

## 4. API documentation — per-stack auto-generation

Auto-generation is settled best practice. Handwritten API docs rot in days.

| Stack | Tool | Output | Where it lives |
|---|---|---|---|
| Python (HTTP services) | **FastAPI's built-in OpenAPI/Swagger UI** | OpenAPI spec + Swagger UI at `/docs` | Inline at runtime (auto-generated; no extra build) |
| Python (libraries) | **Sphinx + autodoc** | HTML from docstrings | `docs/api/` → MkDocs site |
| TypeScript (HTTP services) | **OpenAPI via `tRPC openapi` or `zod-openapi`** | OpenAPI spec + Swagger UI | Inline at runtime |
| TypeScript (libraries) | **TypeDoc** | HTML from TSDoc | `docs/api/` → MkDocs site |
| Cross-cutting | **schemathesis** | Tests generated from OpenAPI | CI workflow (per ADR-0004) |

API docs auto-build on merge to main. The `doc-keeper` agent detects API changes in PR diffs and ensures the auto-gen toolchain is up to date.

## 5. Diagrams — Mermaid

[Mermaid](https://mermaid.js.org/) is the only diagram format supported by default:

- Renders inline in GitHub-flavored Markdown.
- Renders inline in MkDocs Material (with `pymdownx.superfences` configured as above).
- Source-controlled as text in the markdown file.
- Wide LLM training corpus — Claude can author and modify Mermaid reliably.

Use Mermaid for architecture diagrams, sequence diagrams, ER diagrams, state machines, and process flows. For diagrams that exceed Mermaid's capabilities (highly stylized architecture renderings), use a separate tool but commit both the source file and a rendered PNG.

## 6. Standards docs (only in this platform repo)

This platform repo contains `docs/standards/`. Scaffolded projects do not have their own standards directory — they inherit from this platform's standards via the propagation model. A scaffolded project's `docs/` contains: README, ADRs, architecture, runbooks, API. Not standards.

If a scaffolded project needs to deviate from a platform standard, it does so via a project-level ADR that documents the deviation. The deviation lives in the project's ADR list, not as a competing standards document.

## 7. CLAUDE.md — agent-readable project context

Every project repo has a root `CLAUDE.md`. Format and conventions:

- **Length budget:** ≤ 200 lines (longer files get truncated when loaded into context).
- **Content:** project context, agent instructions specific to this project, links to standards and ADRs, current high-priority concerns.
- **Not the place for:** boilerplate that's already in this platform's CLAUDE.md (it's already inherited); long history (use ADRs for that).
- **Updated by:** the head agent + `doc-keeper` subagent. Changes go through PR like any code.

## 8. Doc-keeper agent — scope and triggers

| Trigger | Action |
|---|---|
| PR adds/removes/renames a public API | Update affected docstrings, OpenAPI spec, README usage examples |
| PR changes a CLI flag or env var | Update README + relevant runbook |
| Merge to main with significant change | Refresh README badges, version numbers, navigation in `mkdocs.yml` |
| New ADR accepted | Cross-link from affected standards docs and READMEs |
| Standards doc changes (this platform repo only) | Cascade-update CLAUDE.md mentions if needed |
| TODO comment older than 30 days (per ADR-0005) | Surface in head agent's weekly digest as candidate to fix or delete |
| `runbook` referenced in code/comments doesn't exist | Open issue to author it |
| Operational question repeated in issues twice | Propose a new runbook |
| Auto-gen API doc tooling produces errors | Surface as PR comment, propose fix |

The doc-keeper does NOT:

- Author runbooks from scratch (those need human discernment of intent — head agent's job).
- Decide ADR content (head agent's architect mode handles that).
- Make architectural-quality calls (head agent's job).

Triggers fire on merge to main, not on PR — the doc-keeper updates *current truth*, not draft state.

## 9. Setup checklist

When bootstrapping a new project, the `new-project.sh` script will:

- [ ] Create `docs/` directory with subdirectories (adr/, runbooks/, architecture/, api/)
- [ ] Add `docs/index.md` with project intro
- [ ] Add `mkdocs.yml` with the standard config
- [ ] Add `.github/workflows/docs.yml` referencing the platform's reusable workflow
- [ ] Generate the 5 default runbooks from templates (deploy, rollback, secret-leak, iac-recover, incident-response)
- [ ] Add `docs/adr/index.md` listing the platform's inherited ADRs
- [ ] Add `docs/architecture/overview.md` skeleton
- [ ] Add `CLAUDE.md` at project root (≤ 200 lines, project-specific)
- [ ] Configure GitHub Pages in repo settings (the workflow handles deployment)
- [ ] Add a "Documentation" badge to README linking the published site

## 10. Anti-patterns to avoid

- ❌ **Hand-maintained API docs.** They rot in days. Auto-generate from code.
- ❌ **Documentation in a separate repo.** Splits the canonical source from the docs; inevitable drift.
- ❌ **Runbooks that don't have a Verification section.** "Did it work?" must be answerable without guessing.
- ❌ **ADRs that skip Pros and Cons of the Options.** Future-you needs to see what was *not* chosen and why.
- ❌ **Long CLAUDE.md files.** Anything over 200 lines gets truncated; pull verbosity into ADRs and runbooks.
- ❌ **Runbooks for procedures done once.** Wait until the second time. Premature runbooks rot.
- ❌ **Docs that describe what the code is rather than why it exists.** That's reading the code, not documentation. Documentation explains *why this exists* and *when to use it*.
- ❌ **Skipping the architecture overview.** A reader (future-you, a collaborator, an interviewer) needs a 1-page entry point. Without it, the docs are a pile.
