# ADR-0005: Quality Gates — Linting, Type Checking, Security, Comments

- **Status:** Accepted
- **Date:** 2026-05-08
- **Deciders:** Jason
- **Tags:** quality-gates, linting, type-checking, security, comments

> Format: MADR 4.x (bundled sub-decisions form). See `template.md`.

## Context and Problem Statement

ADR-0004 (Testing) established the dynamic safety layer — what running code does. This ADR establishes the static safety layer — what code says before it runs. Together they're the gate battery the CI/CD shipping authority (ADR-0003) is trusting.

The question: which static-analysis battery, comment policy, and pre-commit/CI split give the AI shipping authority a real safety net cheaply enough that it doesn't bog the inner loop?

This ADR bundles five sub-decisions because linting, type checking, security scanning, comment policy, and the pre-commit/CI split are interdependent — the comment policy depends on what the lint rules can enforce; the security stack depends on what runs in CI; etc.

## Decision Drivers

- **Cheap checks first.** Static analysis catches whole bug classes (typos, type holes, unused imports, security smells) at <1s of CPU each. Tests can't compete on cost-per-bug for these classes.
- **Multi-stack reality.** Python and TypeScript each have rich, opinionated tooling that doesn't translate. Tooling per stack rather than a forced single tool.
- **The "is this code clear?" gap.** No linter judges meaningful naming, well-decomposed functions, or appropriate abstractions. The decision needs to acknowledge that gap and assign someone (or something) to it.
- **Security surface.** Dependency CVEs, SAST, secrets-in-code, IaC misconfig, container vulns, and SBOM are six distinct concerns; covering only one or two leaves real gaps.
- **Pre-commit-vs-CI tradeoff.** Local checks need to be fast (else they're disabled); CI needs to be comprehensive. The split is a real decision.

## Considered Options

The bundle has six sub-decisions:

- **Sub-decision 1 — Linter strictness:** chose **Pragmatic strict** (per-stack rulesets)
- **Sub-decision 2 — Python type checker:** chose **mypy `--strict`** (Pyright per-project ADR allowed)
- **Sub-decision 3 — Security scanning toolset:** chose **Full stack** (Dependabot + Semgrep + gitleaks + tfsec/checkov + Trivy + Syft)
- **Sub-decision 4 — Comment policy:** chose **Public APIs documented; `why` not `what`; TODOs disciplined**
- **Sub-decision 5 — Pre-commit / CI split:** chose **Fast checks locally; full battery in CI**
- **Sub-decision 6 — Code-quality enforcement gap:** chose **Acknowledge explicitly; assign to code-reviewer subagent** (added during proposal review at user's question)

## Decision Outcome

We adopt:

1. **Pragmatic-strict linter rulesets** for Python (Ruff) and TypeScript (ESLint + typescript-eslint).
2. **mypy `--strict` (Python) and TypeScript strict + extras** as the type-checking floor. Pyright permitted per-project via ADR.
3. **Full security scanning stack**: Dependabot + Semgrep + gitleaks + tfsec/checkov + Trivy + Syft.
4. **Comment policy**: public APIs documented (`D` rules / `jsdoc`); `why` not `what`; TODOs require `(@owner): YYYY-MM-DD`; no commented-out code (`ERA`).
5. **Pre-commit hooks (≤10s)** + **full CI battery**.
6. **Complexity limits**: cyclomatic 10/15, function 50/100 lines, file 500 lines (warn).
7. **Code-quality gap explicitly assigned to the `code-reviewer` (subagent) and `architect` (head agent + headless subagent).** Documented in the standards doc so future-you knows where the gap is and who owns it.

## Consequences

### Positive

- Whole bug classes (typos, type holes, security smells, dependency CVEs, secrets in code) caught at static-analysis cost.
- Comments stay useful: required where they help (public APIs), discouraged where they rot (explaining *what*), gated where they accumulate (TODOs).
- The pre-commit / CI split keeps fast feedback fast and comprehensive checks comprehensive.
- The honest documentation of "what no tool can enforce" — and the explicit assignment of that to the AI code-reviewer — keeps the standard from over-claiming. Future-you knows where to look when something feels wrong but lints are green.
- Security coverage is portfolio-grade: SAST + dependency + secrets + IaC + container + SBOM. Each is independently citable.

### Negative

- Setup complexity: each project gets pre-commit + Dependabot + 6 security tools wired. Templates absorb most of this; some friction remains.
- Strict mode (mypy / TS) requires real type discipline. Migration of existing code (during retrofit, Task #16) will not be free.
- Semgrep + Trivy add ~3–5 min to CI runs on full PRs. Acceptable cost.
- The pragmatic-strict ruleset will need tuning per project as patterns emerge — the architect will draft ADRs to add/remove rules.

### Neutral

- We're committed to Ruff format / Prettier as formatters. Black users (Python) will need to migrate; the migration is ~30 min per project.
- Vitest over Jest is reaffirmed (cross-cutting with ADR-0004).
- Pyright as an alternative type checker remains available; the platform default is mypy.

## Pros and Cons of the Options

### Sub-decision 1: Linter ruleset strictness

| Option | Trade-off |
|---|---|
| **Default ruleset only** (E, F for Ruff; recommended-only for ESLint) | Minimal friction; misses bugs the tool is good at catching. |
| **Pragmatic strict** (chosen) | ~20 high-value rule categories; selective disables for known-noisy rules; covers naming, complexity, security smells, modernization, comprehensions. |
| **Everything** (`select = "ALL"`) | Maximum surface; in practice produces bikeshedding on stylistic rules; legitimate code triggers warnings. |
| **Airbnb-style guide** (TS only) | Comprehensive, opinionated; some rules controversial; large rule surface to deviate from. |

### Sub-decision 2: Python type checker

| Option | Trade-off |
|---|---|
| **mypy `--strict`** (chosen) | Industry default; broadest ecosystem; well-documented strict mode; slow on large codebases (acceptable in CI; pre-commit doesn't run it). |
| **Pyright** | Fast (TS-implemented); excellent inference; smaller plugin ecosystem; semantic differences from mypy in edge cases. Acceptable per-project alternative via ADR. |
| **ty** (Astral, new) | Promising — fast, modern; pre-1.0 as of 2026; ecosystem still building. Watch but don't bet. |

### Sub-decision 3: Security scanning toolset

| Option | Trade-off |
|---|---|
| **Just Dependabot** | Minimum viable; misses SAST, secrets, IaC, container, SBOM. |
| **Dependabot + Semgrep + gitleaks** | Covers the most common attack surfaces; misses IaC and containers. |
| **Full stack** (chosen) — Dependabot + Semgrep + gitleaks + tfsec/checkov + Trivy + Syft | Each tool covers a distinct surface; rounds out the SAP-C02-portfolio story; costs ~5min CI on full PRs. |
| **Snyk only (paid)** | Excellent coverage in one tool; ongoing cost; vendor lock-in. |

### Sub-decision 4: Comment policy

| Option | Trade-off |
|---|---|
| **No required comments** | Lowest writing friction; public APIs end up undocumented. |
| **Public APIs documented; `why` not `what`; TODOs disciplined** (chosen) | Comments stay valuable; rot is detectable; public APIs have docstrings. |
| **All public *and* internal APIs require docstrings** | Maximum documentation; high friction; most internal APIs don't benefit; comments rot. |

### Sub-decision 5: Pre-commit / CI split

| Option | Trade-off |
|---|---|
| **Nothing local; CI catches everything** | Zero local setup; slow feedback (push → wait for CI). |
| **Format-only locally** | Auto-fixes formatting; misses lint/secret issues until CI. |
| **Fast checks locally; full battery in CI** (chosen) | <10s local for format+lint+secrets+commit-msg; full battery in CI. |
| **Full CI battery locally** | Catches everything before push; pre-commit takes minutes; people disable it. |

### Sub-decision 6: The code-quality enforcement gap

A direct user question during proposal review: "what is enforcing quality code?"

| Option | Trade-off |
|---|---|
| **Pretend tools cover it** | Dishonest; standard over-claims; failures will surprise. |
| **Acknowledge the gap; assign to AI code-reviewer (head agent and subagent)** (chosen) | Honest; standard documents what tools can't do; explicitly names the responsible agent for "is this code clear?" |
| **Acknowledge the gap; leave unowned** | Honest but unhelpful; problem with no owner stays unsolved. |

## Implementation notes

- Standards doc: [`docs/standards/04-quality-gates.md`](../standards/04-quality-gates.md).
- Pre-commit configurations live in `templates/_shared/pre-commit/` and are copied into each project at scaffold time.
- Security scanning workflow `workflows/security-scan.yml` is shared across projects (Task #15).
- The "code-quality enforcement gap" assignment is operationalized in ADR-0011 (AI workflows), where the code-reviewer subagent's system prompt is authored.

## Links

- [Ruff documentation](https://docs.astral.sh/ruff/) — pragmatic-strict ruleset rationale.
- [typescript-eslint recommended-type-checked](https://typescript-eslint.io/users/configs/) — type-aware lint config.
- [Semgrep registry](https://semgrep.dev/explore) — security rule packs.
- [pre-commit framework](https://pre-commit.com/) — local hook tooling.
- [mypy strict mode](https://mypy.readthedocs.io/en/stable/command_line.html#cmdoption-mypy-strict) — what `--strict` enables.
- [TypeScript strict family](https://www.typescriptlang.org/tsconfig/#strict) — what each flag does.
- [SonarQube cognitive complexity](https://www.sonarsource.com/docs/CognitiveComplexity.pdf) — why we report but don't gate.
- ADR-0003 (CI/CD), ADR-0004 (Testing) — the surrounding safety layers this ADR strengthens.
- [MADR 4.x](https://adr.github.io/madr/) — ADR format used.
