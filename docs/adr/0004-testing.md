# ADR-0004: Testing Strategy & Coverage Model

- **Status:** Accepted
- **Date:** 2026-05-08
- **Deciders:** Jason
- **Tags:** testing, coverage, mutation-testing, ai-autonomy

> Format: MADR 4.x (bundled sub-decisions form). See `template.md`.

## Context and Problem Statement

ADR-0003 (CI/CD Pipeline & Approval Model) granted full shipping authority to the AI pipeline, with the test suite as one of the primary safety layers. This ADR defines the test suite's shape, coverage discipline, and flake policy — the things that determine whether the safety layer is real or theatrical.

The question: what testing standard catches enough regressions cheaply enough that the AI shipping authority is actually safe?

This ADR bundles four sub-decisions because test shape, coverage thresholds, mutation testing, and flake policy form a coherent system — flipping one weakens the others.

## Decision Drivers

- **Test suite is load-bearing.** If tests don't catch the regression, auto-rollback is the only remaining safety net, and rollback only catches what the post-deploy health check sees. Subtle bugs (wrong-but-not-failing-health-check behavior) ship.
- **Mixed-stack reality.** Python services + TypeScript web/APIs + AWS IaC have different bug distributions. A single platform-wide test shape would over-test some code and under-test others.
- **Coverage is a flawed metric.** A single project-wide threshold is too blunt; chasing high numbers creates fragile tests; ignoring coverage entirely loses a cheap regression signal. The right target depends on what code we're talking about.
- **Flakiness is the silent killer.** Auto-retry-to-green creates invisible holes in the safety net. The decision around how to handle flakes determines whether the test suite stays trustworthy over time.
- **AI labor pool.** The test-writer, functional-tester, and e2e-tester agents are the authors. The standard must be specific enough that they produce comparable results across projects.

## Considered Options

The bundle has four sub-decisions:

- **Sub-decision 1 — Test shape:** chose **Per-stack defaults** (pyramid / trophy / integration-heavy)
- **Sub-decision 2 — Coverage thresholds:** chose **Tiered by criticality** (90% / 80% / 60%)
- **Sub-decision 3 — Mutation testing:** chose **Required on critical paths only**
- **Sub-decision 4 — Flaky test policy:** chose **Immediate fix-or-remove**

## Decision Outcome

We adopt:

1. **Per-stack test shapes:** classic pyramid for Python and TS APIs; testing trophy for TS web/UI; integration-heavy for AWS IaC.
2. **Tiered coverage thresholds:** 90% line / 80% branch on critical paths; 80% / 70% default; 60% / 50% utility. Enforced via per-path configuration in the coverage tool. The PR gate fails if any tier's threshold is missed.
3. **Mutation testing required on critical paths**, run on a separate release-time workflow, with a 75% mutation score threshold blocking the staging→prod promotion.
4. **Frameworks:** pytest, Vitest (over Jest), Playwright, Hypothesis/fast-check, mutmut/stryker, schemathesis, Terratest.
5. **Operational test layer definitions** locked in (unit < 10ms; integration < 1s; e2e seconds; smoke; contract).
6. **Immediate fix-or-remove** for flaky tests. No grace period.
7. **Real ephemeral DBs** in integration tests (Testcontainers / pytest-postgresql); no SQLite-as-Postgres-stand-in.
8. **Production data forbidden** in non-prod environments.

## Consequences

### Positive

- The test suite is shape-appropriate to each stack instead of force-fit.
- Critical code (auth, payments, data integrity) gets the heavy testing it deserves; utility code doesn't generate maintenance churn for tests of trivial helpers.
- Mutation testing on critical paths catches the "tests run but don't actually verify anything" failure mode that coverage can't detect.
- Immediate flake remediation keeps the safety net trustworthy over time — a quarantine model would let it rot.
- The tiered coverage model is a **stronger portfolio signal** than "we have 80% coverage" — it shows risk-aware testing thinking.

### Negative

- **Configuration overhead.** Tiered coverage requires path-glob configuration per project. Templates absorb most of this cost; some per-project tuning unavoidable.
- **Mutation testing adds release-time minutes.** Acceptable since it's not on the per-PR path.
- **Immediate flake fix is aggressive.** A genuine infra blip (network glitch on a download step) can block merges. Mitigation: the AI agents (architect + test-writer) are good at distinguishing infra from test issues; the policy is "fix or remove," which includes "remove the infra dependency from the test."
- **Real ephemeral DBs** add CI runtime and complexity vs. mocks/SQLite. The trade is genuine bug-catching vs. fast-feedback; we chose bug-catching because we're betting the shipping authority on it.

### Neutral

- The tier classification is initially default-driven (path globs). It will need refinement per project as new critical paths emerge. The architect will propose tier changes via ADR.
- We're committed to Vitest over Jest for new TS projects. Existing Jest projects (during retrofit, Task #16) can stay on Jest if migration cost outweighs benefit; that decision is per-project.

## Pros and Cons of the Options

### Sub-decision 1: Test shape

| Option | Trade-off |
|---|---|
| **Single platform-wide pyramid** | Simple; mismatched for UI-heavy projects where integration matters more than unit. |
| **Per-stack defaults** (chosen) | Pyramid for backend services (where pure-function unit tests are cheap and catch most bugs); trophy for UI (where bugs concentrate at component integration); integration-heavy for IaC (where unit-testing has limited value). Stack-appropriate. |
| **No prescribed shape** | Each project decides; loses standardization benefit. |

### Sub-decision 2: Coverage thresholds

| Option | Trade-off |
|---|---|
| **No threshold** | No false-pass tests written for the number; loses cheap regression signal. |
| **Single project-wide number** (e.g., 80%) | Industry default; underweights critical code, overweights utility code. |
| **Tiered by criticality** (chosen) | 90% critical / 80% default / 60% utility. Coverage proportional to risk. More configuration overhead, much better signal. |
| **Aspirational 95%+** | Triggers fragile-test syndrome; tests become coupled to implementation. |

### Sub-decision 3: Mutation testing

| Option | Trade-off |
|---|---|
| **Required everywhere** | Gold-standard signal; slow (5–20× test runtime); high cost. |
| **Required on critical paths only** (chosen) | Targets the cost where it matters; runs on a separate (release-time) workflow; doesn't slow per-PR feedback. |
| **Optional / not required** | Loses the only metric that actually measures bug-catching; coverage alone can be gamed. |

### Sub-decision 4: Flaky test policy

| Option | Trade-off |
|---|---|
| **Auto-retry up to N times** | Pragmatic but creates flake debt; safety net silently degrades. |
| **Quarantine + 7-day fix deadline** | Google's approach; fits multi-team orgs that can't block on one team's flake. |
| **Immediate fix-or-remove** (chosen) | Aggressive; works because solo + AI labor doesn't have the cross-team coordination cost that justifies grace periods. Keeps the safety net real. |
| **Zero tolerance** (any failure permanently red) | Too brittle; can't distinguish flake from transient infra issue. |

## Implementation notes

- Standards doc: [`docs/standards/03-testing.md`](../standards/03-testing.md).
- Coverage tier configuration is part of each per-stack template (Task #14).
- Mutation testing workflow is part of reusable workflows (Task #15) and runs on release tags only.
- Flake detection workflow runs each PR's tests twice and flags discrepancy. Implementation in `workflows/flake-detect.yml`.
- The "production data forbidden in non-prod" rule cross-cuts the secrets management standard (ADR-0006) — that ADR defines the data scrubbing pipeline.

## Links

- Mike Cohn, *Succeeding with Agile* (2009) — origin of the test pyramid.
- Kent C. Dodds, [The Testing Trophy and Testing Classifications](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications) — the trophy model for UI-heavy apps.
- Google Testing Blog, [Avoiding Flakey Tests](https://testing.googleblog.com/2017/04/where-do-our-flaky-tests-come-from.html) — flake taxonomy.
- [mutmut](https://mutmut.readthedocs.io/), [stryker](https://stryker-mutator.io/) — mutation testing tooling.
- Mark Seemann, *Code That Fits in Your Head* — argues against blind coverage targets.
- Atlassian Engineering Playbook, [Code Coverage thresholds](https://www.atlassian.com/continuous-delivery/principles/measuring-success) — industry data on the 80% rule.
- [Testcontainers](https://testcontainers.com/) — real-database integration testing.
- ADR-0003 (CI/CD) — defines the safety layers this ADR strengthens.
- [MADR 4.x](https://adr.github.io/madr/) — ADR format used.
