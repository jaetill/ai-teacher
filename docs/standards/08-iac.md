# Standard 08 — Infrastructure as Code

**Status:** 🟩 Decided (2026-05-08)
**ADR:** [ADR-0007](../adr/0007-iac.md)

How AWS infrastructure is described, versioned, deployed, and kept in sync with reality. The SAP-C02-relevant standard.

## Summary

| Concern | Choice |
|---|---|
| IaC tool | **OpenTofu** (Terraform-compatible, open source) |
| Project organization | Hybrid: shared modules in this platform repo + per-project `terraform/` directories |
| State backend | **S3 + DynamoDB** (per AWS account) |
| Environment separation | **Directory-per-env** (`envs/dev/`, `envs/staging/`, `envs/prod/`) |
| Drift detection | Scheduled weekly `plan` + `drift-detector` agent triage |
| Cost management | **Infracost** on PR + **AWS Budgets** per project/env |
| **Performance budgets** | **App-only PR: 0s IaC overhead. IaC PR: ≤3 min IaC. Deploy: ≤3 min.** (See §8.) |
| Per-project alternative | **AWS CDK** allowed via project ADR for TS-heavy projects |

## 1. Tool — OpenTofu

[OpenTofu](https://opentofu.org/) is the open-source fork of Terraform created after HashiCorp's 2023 license change. API-compatible with Terraform; supported by AWS, Oracle, GitLab, and the broader OSS community.

```bash
brew install opentofu     # macOS
# or: winget install OpenTofu.OpenTofu (Windows)
# or: see https://opentofu.org/docs/intro/install/

tofu init
tofu plan
tofu apply
```

The CLI is `tofu`. Workflows reference `opentofu/setup-opentofu@v1` for GitHub Actions setup.

### When CDK is appropriate (per-project ADR)

- TypeScript-heavy projects where co-locating infra and app code in TS has real value.
- Projects that depend on AWS-Construct-Library patterns (e.g., complex API Gateway setups) that are awkward to express in HCL.
- Decision must be documented in the project's own ADR (not the platform's).

## 2. Project organization — hybrid

### Per-project layout

```
my-project/
├── terraform/
│   ├── modules/              # project-specific modules (used only by this project)
│   ├── envs/
│   │   ├── dev/
│   │   │   ├── main.tf       # composes modules; references shared platform modules
│   │   │   ├── backend.tf    # state config (s3 backend pointing to dev key)
│   │   │   ├── variables.tf
│   │   │   ├── terraform.tfvars      # env-specific non-secret values
│   │   │   └── providers.tf
│   │   ├── staging/
│   │   └── prod/
│   └── README.md             # project-specific IaC docs
└── ... (rest of project)
```

### Shared modules (in this platform repo)

Reusable modules live at `templates/_shared/terraform-modules/`:

```
templates/_shared/terraform-modules/
├── vpc/                      # reusable VPC pattern
├── iam-github-oidc/          # the OIDC role from secrets standard
├── secrets-baseline/         # standard secrets/config setup per env
├── observability-baseline/   # CloudWatch dashboards, alarms (forthcoming)
├── lambda-service/           # Lambda function with sensible defaults
├── ecs-service/              # ECS Fargate service with sensible defaults
└── README.md
```

Modules are versioned via Git tags (e.g., `modules/v1.0.0`), and projects pin to a specific version:

```hcl
module "vpc" {
  source = "git::https://github.com/<you>/agentic-dev-environment.git//templates/_shared/terraform-modules/vpc?ref=modules/v1.0.0"
  cidr   = "10.0.0.0/16"
  name   = "${var.project}-${var.env}"
}
```

This composes naturally with release-please — module versions move forward independently of the platform itself.

## 3. State backend — S3 + DynamoDB

Each AWS account has one shared backend used by all projects in that account:

- **S3 bucket:** `<account-prefix>-tfstate-<account-id>` with:
  - Versioning enabled
  - Server-side encryption (SSE-KMS or SSE-S3)
  - Public access blocked
  - Lifecycle policy: keep current + 30 historical versions
- **DynamoDB table:** `terraform-state-lock` with `LockID` (string) as partition key, on-demand billing.

Each project's environment uses a unique state key:

```hcl
# my-project/terraform/envs/prod/backend.tf
terraform {
  backend "s3" {
    bucket         = "my-account-tfstate-123456789012"
    key            = "my-project/prod/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-state-lock"
    encrypt        = true
  }
}
```

### One-time backend bootstrap

`scripts/bootstrap-tf-backend.sh` (forthcoming) creates the S3 bucket + DynamoDB table once per AWS account, using the AWS CLI (no chicken-and-egg). The script is idempotent — re-runs report "already exists" and exit clean.

## 4. Environment separation — directory-per-env

Each environment gets its own directory under `terraform/envs/`. Each is a complete Terraform root module — independent state, independent provider config, independent variables.

Why directory-per-env, not workspaces:

- Workspaces share code and config between envs; differences leak via conditionals (`count = var.env == "prod" ? 1 : 0`) which become unreadable.
- Workspaces share provider config; if envs use different AWS accounts (recommended for prod isolation), workspaces break down.
- HashiCorp's own modern guidance (and most production patterns: Gruntwork, Terraform-best-practices repos) recommend directory-per-env.

Variables that are env-specific (instance sizes, replica counts, log levels) live in each env's `terraform.tfvars`. Code that's env-shared lives in modules.

## 5. Drift detection

Drift = "the actual state of cloud resources differs from what Terraform says they should be." Causes: someone clicked in the AWS console; an automated process modified a resource; an upgrade in AWS changed defaults.

### Detection workflow

`workflows/iac-drift-detect.yml` runs scheduled (weekly, Monday morning):

1. Checks out each project's IaC.
2. For each environment in each project, runs `tofu plan -refresh-only -detailed-exitcode`.
3. Exit code 2 = drift detected.
4. On drift: opens a GitHub issue with the plan diff, assigned to `drift-detector` agent.

### Drift-detector agent (the 11th agent)

The agent's responsibilities:

- Read the drift report (the `plan -refresh-only` output).
- Classify the drift:
  - **Intentional out-of-band change** (someone added a tag in the console for an ad-hoc reason) → propose IaC update to absorb it.
  - **Unintentional drift** (someone changed a setting that should be IaC-managed) → propose `tofu apply` to restore IaC-declared state.
  - **AWS-side drift** (AWS upgraded a default; old IaC says X, new actual is Y) → propose IaC update to match new default + ADR if the change has implications.
  - **Structural drift** (resources exist that aren't in IaC at all) → escalate to architect agent.
- Open a PR with the proposed fix and a summary explaining the classification.
- Merge follows the standard PR flow (with the destructive-change detector if applicable).

## 6. Cost management

### Infracost on PRs

`workflows/infracost.yml` runs on every PR that touches IaC files. It comments on the PR with cost impact:

```
+ aws_db_instance.postgres        +$58.40/mo
~ aws_lambda_function.api          $0.00 (no change)
- aws_s3_bucket.legacy            -$1.20/mo

Estimated monthly cost change: +$57.20
```

Threshold: any PR with > $10/month cost increase requires acknowledgement in the PR description (no ADR needed — this is informational).

### AWS Budgets per project + per env

Each project gets a Budget per environment with alert thresholds:

| Threshold | Action |
|---|---|
| 50% of budget | Inform-only (logged) |
| 80% of budget | Email + GitHub issue opened |
| 100% of budget | Email + Slack page (when observability standard is decided) |

Default budgets:
- Dev: $25/mo
- Staging: $25/mo
- Prod: $100/mo (project-overridable)

These are sized for free-tier-friendly architectures. Projects that deliberately exceed (e.g., multi-region Aurora) override via ADR.

## 7. Cost picture (per-commit and per-month)

### Per-commit cost

| Item | Cost |
|---|---|
| GitHub Actions CI minutes | $0 (unlimited for public repos) |
| Infracost | $0 (free tier covers solo + small team) |
| OpenTofu | $0 (open source) |
| Semgrep / gitleaks / tfsec / checkov / Trivy / Syft | $0 (free for OSS repos) |
| State backend access | $0 (well within free tier; state files are KB-sized) |
| Drift detection weekly run | $0 (`terraform plan` is read-only) |
| AI subagent runs (code-reviewer, etc.) | $0 to small (token cost; pennies per PR at most) |

### Per-month cost (ongoing, not per-commit)

| Item | Cost |
|---|---|
| 1Password Personal | $3/mo (you may already pay this) |
| AWS Secrets Manager | $0.40/secret/mo × ~5 secrets/project = ~$2/project |
| AWS Parameter Store | $0 (standard parameters are free) |
| S3 state storage | <$0.10/mo total (state files are KB) |
| DynamoDB lock table | $0 (on-demand; free tier covers solo lock activity) |
| CloudWatch logs (per Standard 06) | TBD |
| Actual deployed AWS resources | depends on architecture; ~$5–25/project for typical free-tier-friendly deployments |

The infrastructure-and-tooling fixed cost is roughly **$3–10/project/month**. The variable cost is whatever the actual deployed resources do, which the Infracost preview surfaces before you commit to it.

## 8. Performance budgets

The IaC standard MUST NOT make commits feel slow. Explicit budgets, defended by reusable workflows:

| Workflow / trigger | Budget | Mechanism |
|---|---|---|
| Pre-commit (any change) | ≤10s total | Only `tofu fmt` runs in pre-commit; heavy checks are CI-only |
| **App-only PR** (no `terraform/` files changed) | **0s IaC overhead** | Path filters (`paths: 'terraform/**'`) on every IaC workflow — they don't fire on app-only PRs |
| IaC-touching PR | ≤3 min IaC overhead | `validate`, `tflint`, `tfsec`, `checkov`, `Infracost`, `plan` run in parallel jobs |
| Deploy to dev on merge | ≤3 min for solo-scale projects | `tofu apply` against the dev workspace; revisit if exceeded |
| Drift detection | Out-of-band, weekly schedule | Doesn't touch the commit or PR cycle |
| Per-stack template scaffold | ≤2 min | One-time when a project is bootstrapped |

### Optimizations baked into reusable workflows

- **Path filters** on `terraform-pr.yml`, `infracost.yml`, `iac-drift-detect.yml` — run only when `terraform/` changes.
- **`paths-ignore`** for `terraform/**/*.md` and `terraform/**/README.md` — doc-only changes don't trigger plans.
- **Provider plugin caching** via `actions/cache` against `~/.terraform.d/plugin-cache` — saves 30–60s per run.
- **Parallel matrix jobs** for the IaC check battery — `validate` || `tflint` || `tfsec` || `checkov` || `Infracost` rather than serial.
- **Minimal `tofu init`** — no module re-download when the lockfile is unchanged.
- **AI agents fan out in parallel** — `code-reviewer` and `security-reviewer` and `drift-detector` don't queue serially.

### When budgets are violated

Budget violations are not silently accepted. The `architect` agent opens an investigation and proposes either:

1. A workflow tuning ADR (e.g., "add a new caching layer here"), or
2. A budget revision ADR (e.g., "this project's plan time legitimately requires 4 min because of resource count; new budget is 5 min").

The first option is preferred. The second requires a real reason, not "we got tired of optimizing."

## 9. Setup checklist

When bootstrapping a new project that uses AWS infrastructure, the `new-project.sh` script will:

- [ ] Create `terraform/` directory structure (modules/, envs/{dev,staging,prod}/)
- [ ] Generate `backend.tf` for each env pointing to the shared state backend
- [ ] Generate `providers.tf` with AWS provider pinned to the latest stable
- [ ] Generate starter `main.tf` referencing relevant platform shared modules (VPC, OIDC, secrets baseline, observability baseline)
- [ ] Add `.terraform.lock.hcl` to git (provider version pinning)
- [ ] Add `.gitignore` entries for `.terraform/`, `*.tfstate*`, `*.tfvars` (real values; templates committed)
- [ ] Wire `workflows/ci-iac.yml` for plan-on-PR
- [ ] Wire `workflows/infracost.yml` for cost preview
- [ ] Wire `workflows/iac-drift-detect.yml` (scheduled)
- [ ] Create AWS Budgets per environment (via CLI, since IaC for IaC's own monitoring is meta-circular)
- [ ] Add `docs/runbooks/iac-recover.md` from template (state file lost / corrupted recovery procedure)

## 10. Anti-patterns to avoid

- ❌ **Local state.** Loses state on machine swap, blocks concurrent access, unreviewable. Always use the S3 backend.
- ❌ **Workspaces for env separation.** Use directory-per-env.
- ❌ **Manual changes via the AWS console.** Drift compounds; auto-detection eventually surfaces it but the cleanup is painful. If a console change is truly needed, document it and plan to absorb into IaC.
- ❌ **Unpinned provider versions.** Reproducibility evaporates. `.terraform.lock.hcl` exists for this; commit it.
- ❌ **Modules with hard-coded account IDs / region / etc.** Variables are free; use them.
- ❌ **Mixing infra and app deploys in one Terraform run.** Infra changes slowly; app deploys frequently. Separate `terraform apply` from `aws lambda update-function-code`. App deploys belong in CI/CD workflows; IaC handles the long-lived resources.
- ❌ **Skipping cost preview for small changes.** A "small change" that adds an RDS instance silently is exactly what Infracost catches.
- ❌ **`terraform apply` in CI on PR.** Apply happens only on merge to main and on tag promotion (per CI/CD standard). PR runs `plan` only.
