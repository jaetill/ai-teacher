# ADR-0043: Vercel production deploy via Actions-gated workflow

- **Status:** Accepted
- **Date:** 2026-06-26
- **Deciders:** Jason
- **Tags:** ci-cd, deployment, vercel

> **Format:** MADR 4.x. See `template.md`.

## Context and Problem Statement

Vercel's git integration auto-deploys every push to `main` directly to production
with no gate between CI and the live URL. As `ai-teacher` moves from experiment to
daily-use tool, an uncontrolled auto-deploy is a liability: a broken push ships
before CI results are visible.

Vercel PR Previews (created automatically for every branch/PR) already provide a
TEST-equivalent deploy URL, so the value of the Vercel GitHub App is preserved for
feedback during development. The missing piece is a controllable gate on the
production deploy path.

Platform decision: `agentic-dev-environment` ADR-0043.

## Decision Drivers

- **Gate before production.** CI must pass before any production deploy starts.
- **Configurable protection.** The protection model (wait timer, required reviewer,
  deployment branch policy) should live in GitHub Environments, not in workflow YAML,
  so it can be tightened or relaxed without a code change.
- **Keep PR previews.** Vercel preview URLs per PR are useful; the GitHub App should
  remain installed and active for those.

## Considered Options

- **Option A (chosen):** Disable Vercel git auto-deploy for `main`; add a
  `deploy-prod.yml` workflow that triggers on `workflow_run` completion of CI and
  deploys via `vercel deploy --prod` behind a GitHub `production` Environment.
- **Option B:** Keep auto-deploy; add a Vercel deployment protection rule. Vercel
  Pro/Team required for custom protection; not available on the Hobby tier.
- **Option C:** Merge to a `release` branch manually; Vercel deploys from that
  branch. Reintroduces a long-lived environment branch — an anti-pattern per
  ADR-0002.

## Decision Outcome

**Option A.** A `deploy-prod.yml` workflow:

- Triggers on `workflow_run` of the `CI` workflow completing successfully on `main`.
- References the GitHub Environment `production` — protection rules (wait timer,
  required reviewer) are configured once in the GitHub UI and apply automatically.
- Calls `vercel deploy --prod --yes` using environment-scoped secrets.

Vercel auto-deploy for `main` is disabled in the Vercel dashboard (one-time manual
step after merging this ADR).

## Consequences

### Positive

- Production deploy is blocked until CI passes — enforced by `workflow_run`.
- Protection rules live in GitHub Environments, not in YAML — no code change
  needed to add or remove a required reviewer.
- Deploy history appears in Actions alongside every other pipeline step.
- PR preview URLs are unaffected.

### Negative

- Three new secrets required in the `production` GitHub Environment:
  `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
- Vercel auto-deploy must be manually disabled in the Vercel dashboard
  after merging — a one-time setup step not automatable from this repo.
- A `workflow_run` trigger requires the `CI` workflow to be named exactly `CI`
  (case-sensitive); renaming it without updating `deploy-prod.yml` would silently
  break the deploy chain.

### Neutral

- Vercel build still runs on Vercel's infra (not Actions runners); the workflow
  only invokes the CLI handshake.

## Implementation notes

- New workflow: `.github/workflows/deploy-prod.yml`.
- `ci.yml` comment updated to remove "Vercel owns deployment" language.
- **Post-merge setup checklist:**
  1. Vercel dashboard → Project → Settings → Git → disable "Auto-assign
     Production Domains to latest push" (or revoke the GitHub integration for
     the main branch while keeping PR previews).
  2. GitHub → Settings → Environments → create `production` environment.
  3. Add environment secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
  4. Optionally add a wait timer or required reviewer to the environment.

## Links

- Platform ADR-0043 (`agentic-dev-environment` repo) — source decision.
- [GitHub Environments docs](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)
- [Vercel CLI deploy](https://vercel.com/docs/cli/deploy)
- [ADR-0003](0003-ci-cd.md) — CI/CD pipeline; "promote artifacts, not branches."
- [ADR-0002](0002-source-control.md) — no long-lived environment branches.
