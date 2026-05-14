# Standard 02 — CI/CD

**Status:** 🟩 Decided (2026-05-08)
**ADR:** [ADR-0003](../adr/0003-ci-cd.md)

How code goes from commit to production. The platform's working assumption is that **AI has full shipping authority for normal work**, and the human is only involved at architectural decision points (via ADRs).

## Summary

| Concern | Choice |
|---|---|
| Environments | `dev+staging+prod` (live-data projects); `dev+prod` (experiments). Project-configurable. |
| Promotion | Fully automated, trigger-based throughout |
| Approval gates | AI is the deploy gate. Human only via ADR for 5 specific change categories (see §4). |
| Deploy strategy | Per-stack defaults with automated rollback |
| CI gates on PR | Lint + type + test + security + AI-review (code-reviewer + security-reviewer) + destructive-change detector |
| Visibility | Digest (daily/weekly), decision queue, incident-only pings |

## 1. Environment topology

### Live-data projects (e.g., Game Night)

```
   feature branch ──PR──► main ─auto──► dev
                                          │
                       release-please ────┘
                              │
                              ▼
                          tag vX.Y.Z ─auto──► staging
                                                │
                                                ▼ (AI verification)
                                              ─auto──► prod
                                                         │
                                                         ▼ (auto-rollback on failure)
```

Three environments. `dev` is a free-for-all (every merge). `staging` exists so the AI testing agents (functional-tester, e2e-tester) can validate against a prod-like environment without touching prod. `prod` runs against live user data.

### Experimental / non-live-data projects

Two environments: `dev` and `prod`. No staging — testing happens on dev. Suitable for personal experiments where breakage is recoverable and there's no user data to protect.

The choice between topologies is per-project, made at scaffold time.

### Environment configuration

- One [GitHub Environment](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment) per real environment (`dev`, `staging`, `prod`).
- Each environment has its own secrets (per the secrets management standard, forthcoming).
- Each environment has its own deployment URL/endpoint and observability scope.
- 12-factor: configuration is in env vars, never in code. The same artifact (commit SHA / tag) deploys to all envs with different config injected.

## 2. Promotion mechanism — fully automated

**Promote artifacts, not branches.** The same commit/tag flows through every environment. No environment-specific branches.

| Trigger | Effect |
|---|---|
| PR opened | Run full CI gate battery. Block merge if any gate fails. |
| All gates green on PR | **Auto-merge.** No human click required (except for ADR-gated categories — see §4). |
| Merge to `main` | Deploy commit to `dev`. Run e2e tests on dev (e2e-tester agent). |
| `release-please` opens release PR | (Generated automatically from Conventional Commits since last release.) |
| Release PR merged | Tag created (`vX.Y.Z`). |
| Tag created | Deploy tag to `staging`. Run AI verification (functional-tester + e2e-tester + smoke tests). |
| Staging verification green | **Auto-promote tag to `prod`.** No manual click. |
| Prod deploy succeeds | Post-deploy health monitoring (15 min window). |
| Prod health check fails within window | **Automated rollback** to previous version. incident-responder triages. |
| Rollback fails | incident-responder pages the human. |

In normal operation, **there are zero human touchpoints in the pipeline**. The release-please PR auto-merges (handled by `release-captain`); feature PRs auto-merge (per ADR-0003's AI shipping authority).

The cases that *do* require a human:

1. **ADR-gated PR** (one of the 5 categories in §4): blocked until a paired ADR is Accepted. The human's role here is decision-making (architect mode), not PR review.
2. **`release-block` label** on a release PR: opt-in escape hatch where the human wants to look at a specific upcoming release before it ships (e.g., a 1.0 launch). Rare.
3. **Manual emergency override** workflow: human-initiated `workflow_dispatch` for genuine emergencies where standard flow is too slow.

These three are intentional decision moments, not routine review.

## 3. CI gate scope per trigger

### On every PR

| Gate | Tool / mechanism |
|---|---|
| Lint | Per quality-gates standard (forthcoming) |
| Type-check | Per quality-gates standard |
| Unit tests | Per testing standard (forthcoming) |
| Integration tests | Per testing standard |
| Security scan | Dependency CVE scan, SAST (per quality-gates standard) |
| AI code review | `code-reviewer` subagent runs against the diff |
| AI security review | `security-reviewer` subagent runs against the diff |
| Conventional Commit format | PR title format check |
| Destructive-change detection | Detects `DROP`, `ALTER COLUMN ... DROP`, mass deletes; labels PR `requires-adr` if found |

If any gate fails: block merge.
If all gates pass and PR is **not** in an ADR-gated category: auto-merge.
If all gates pass and PR **is** in an ADR-gated category: hold for paired ADR (see §4).

### On merge to `main`

| Step | Action |
|---|---|
| Deploy to `dev` | Auto |
| e2e tests on `dev` | `e2e-tester` agent runs the Playwright suite |
| Coverage report | Per testing standard |
| Doc-keeper sync | `doc-keeper` updates README/runbooks if affected |

### On release tag (`vX.Y.Z`)

| Step | Action |
|---|---|
| Deploy to `staging` | Auto |
| Smoke tests | `functional-tester` agent |
| e2e tests on staging | `e2e-tester` agent |
| Performance baseline check | (TBD per observability standard) |
| All green → deploy to `prod` | Auto |
| Post-deploy health watch | 15 minute window |
| Health failure → rollback | Auto |

### On schedule (daily)

| Job | Action |
|---|---|
| Dependency CVE scan | If new CVE: open PR with the bump (Dependabot/Renovate) |
| `dep-watcher` reviews open dep PRs | Auto-merges low-risk; flags high-risk for ADR |
| Drift detection (IaC) | (Per IaC standard, forthcoming) |
| Audit log retention | Trim old audit logs to repo size budget |

## 4. ADR-gated change categories

These five categories **block auto-merge** until a paired ADR exists in `docs/adr/` and has status `Accepted`. The architect agent drafts the ADR; the human discerns and accepts.

| Category | Why ADR-gated |
|---|---|
| **Destructive DB migration** | Cannot be auto-rolled-back. `DROP TABLE`, `ALTER COLUMN ... DROP`, mass deletes. |
| **New external dependency or service** | Adds attack surface, ongoing cost, vendor lock-in. |
| **Security-relevant change** | Auth, authz, session handling, secrets handling, permission changes. Mistakes have outsized blast radius. |
| **API contract change** | Breaking endpoint changes, schema changes that downstream consumers depend on. |
| **Schema / data model change** | Even non-destructive ones — they cascade into clients, migrations, and reporting. |

**Detection:** the destructive-change detector is part of the PR gate battery. It runs static analysis on the diff (looks for migration files, dependency manifests, security-tagged paths, schema files) and labels the PR. The architect agent reads the label and offers to draft a paired ADR.

**Override:** there is no "skip ADR" override. If the human wants to ship without the ADR, they decline the architect's draft, and the merge stays blocked. The path forward is to write the ADR, not to bypass the gate.

## 5. Deploy strategies (per stack)

| Stack | Default strategy | Rationale |
|---|---|---|
| AWS Lambda | Lambda alias blue-green (the `live` alias points to a versioned function) | Native feature; instant rollback by re-pointing the alias; no extra cost. |
| AWS ECS / Fargate | Rolling deploy with health checks | Default ECS deployment behavior; mature. |
| Static (Vercel, S3+CloudFront) | Atomic switch | Provider-handled; instant rollback by re-pointing. |
| AWS EC2 / VM | Blue-green via ASG swap | Slowest to set up but safest with live data. |
| Database migrations | Expand-contract pattern | Schema changes happen in two deploys: expand (add new) → migrate data → contract (remove old). Each step is reversible. |

A project can override its default strategy with an ADR.

## 6. Auto-rollback policy

After a prod deploy, the workflow watches health for **15 minutes**. Health is defined per project (per observability standard) but at minimum includes:

- HTTP 5xx error rate < N% of pre-deploy baseline
- p99 latency within M% of pre-deploy baseline
- Synthetic smoke test passing

If health degrades within the window:

1. `incident-responder` agent triggers.
2. Auto-rollback to previous version (re-point Lambda alias / re-deploy previous tag / re-point CloudFront origin).
3. Post-rollback health check.
4. If rollback succeeds: incident-responder drafts a postmortem; emails human.
5. If rollback fails: incident-responder pages human immediately. This is the only synchronous interrupt in the system.

## 7. Visibility model

Since the human is not in the per-PR loop, deliberate visibility mechanisms are required.

| Mechanism | Cadence | Producer |
|---|---|---|
| **Daily digest** | Each morning | scrummaster |
| **Weekly digest** | Friday afternoons | scrummaster |
| **Release notes** | On every prod deploy | release-captain (auto-generated from release-please) |
| **Decision queue** | Always-current `docs/adr/_pending.md` | architect (when an ADR-gated PR appears) |
| **Brainstorm session** | On-demand via `/brainstorm <topic>` | architect + topic-specific agent |
| **Incident page** | On rollback failure | incident-responder |

Digest content includes (especially during the **calibration period**, first 2–4 weeks of operation):

- PRs merged + summary
- Releases shipped
- ADRs pending decision
- Test coverage trend
- A **calibration sample**: 2–3 PRs auto-merged this period that the human can read in full to spot-check AI judgment quality

After the calibration period: digests trim down to summary + decision queue + incidents only.

## 8. Reusable workflows (defined in this platform)

Each scaffolded project references reusable workflows from this repo (`workflows/*.yml`):

| Workflow | Purpose |
|---|---|
| `ci-python.yml` | Lint+type+test+security+build for Python projects |
| `ci-typescript.yml` | Lint+type+test+security+build for TS/Node projects |
| `ci-iac.yml` | `terraform validate` / `cdk synth`, tflint, tfsec/checkov |
| `claude-pr-review.yml` | Triggers code-reviewer + security-reviewer + destructive-change detector |
| `release-please.yml` | release-please action wired with Conventional Commits |
| `deploy-dev.yml` | Reusable deploy-to-dev (parameterized by stack) |
| `deploy-staging.yml` | Reusable deploy-to-staging |
| `deploy-prod.yml` | Reusable deploy-to-prod with auto-rollback |
| `health-watch.yml` | Post-deploy health monitoring window |
| `auto-rollback.yml` | Reusable rollback workflow |

Implementation of these workflows happens in Task #15 (Wire reusable GitHub Actions workflows).

## 9. Setup checklist

When bootstrapping a new project, the `new-project.sh` script will:

- [ ] Create three GitHub Environments (dev, staging, prod) — or two if non-live-data
- [ ] Wire the appropriate `ci-<stack>.yml` reusable workflow
- [ ] Wire `claude-pr-review.yml`
- [ ] Wire `release-please.yml` (with `release-as` config matching project versioning)
- [ ] Wire `deploy-*.yml` workflows for each environment
- [ ] Configure auto-merge rules: enable auto-merge, require all status checks
- [ ] Configure environment secrets via `gh secret set --env <env>` (placeholders; real secrets per secrets standard)
- [ ] Add `health-watch.yml` for prod
- [ ] Add `.github/workflows/digest.yml` — scheduled daily/weekly digest job
- [ ] Add an empty `docs/adr/_pending.md` for the decision queue

## 10. Anti-patterns to avoid

- ❌ **"Just this once" manual approval gates.** They rot. Either automate or formally ADR-gate the change category.
- ❌ **Different code in different environments.** Same artifact, different config. Period.
- ❌ **Skipping staging "because it's a small change."** Staging exists so the testing agent can verify; bypassing it bypasses the AI safety net.
- ❌ **Auto-rollback that doesn't actually verify health post-rollback.** A rollback that reintroduces the previous bug is a worse outcome than the original failure.
- ❌ **Letting the calibration sample atrophy.** During the first 2–4 weeks, *do* spot-check what AI shipped. Trust is earned, not assumed.
