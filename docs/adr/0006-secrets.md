# ADR-0006: Secrets Management — Two-Vault Model + AWS OIDC

- **Status:** Accepted
- **Date:** 2026-05-08
- **Deciders:** Jason
- **Tags:** secrets, security, aws, vault, pii

> Format: MADR 4.x (bundled sub-decisions form). See `template.md`.

## Context and Problem Statement

ADR-0003 (CI/CD Pipeline & Approval Model) granted AI shipping authority for the platform's projects, including projects with live user data (Game Night). That authority is only safe if the secrets supporting it are stored, accessed, and rotated correctly.

The question: where do secrets live, how do they reach the processes that need them, and how do we keep production data out of places it shouldn't be?

This ADR bundles six sub-decisions because vault choice (personal vs deployment), CI auth, rotation, and non-prod data handling are interdependent and only make sense together.

## Decision Drivers

- **Live data exists.** Game Night handles real user data; PII protection is a privacy obligation, not a portfolio nicety.
- **Multi-stack reality.** AWS-deployed projects, Vercel-deployed projects, and local development each have different natural secret-storage solutions.
- **AI as labor pool.** Agents need to access secrets they're authorized for (e.g., the deploy agent reads deploy creds) without exposure to humans or to other agents.
- **SAP-C02 portfolio relevance.** AWS-native secret management (Secrets Manager + IAM + OIDC) is a directly studied SAP-C02 topic and worth implementing the canonical way.
- **Solo developer.** Setup must be quick enough to actually do; ongoing rotation must not depend on human discipline alone (which rots).

## Considered Options

The bundle has six sub-decisions:

- **Sub-decision 1 — Personal vault for local dev:** chose **1Password CLI**
- **Sub-decision 2 — Deployment vault:** chose **Per-stack defaults** (AWS Secrets Manager / Vercel env)
- **Sub-decision 3 — AWS Secrets Manager vs Parameter Store:** chose **Both** (Secrets Manager for actual secrets, Parameter Store for non-secret config)
- **Sub-decision 4 — CI authentication to AWS:** chose **AWS OIDC** (no static keys)
- **Sub-decision 5 — Rotation policy:** chose **Auto where supported; 90-day reminder elsewhere**
- **Sub-decision 6 — Non-prod data handling:** chose **Prod data forbidden in non-prod**

## Decision Outcome

We adopt the **two-vault model with AWS OIDC and prod-data-forbidden-in-non-prod**:

1. **Personal vault:** 1Password CLI with `op run` for local development. No `.env` files containing real secrets; references-only `.env.local.template` is the workflow.
2. **Deployment vault:** Per-stack defaults — AWS Secrets Manager for AWS-deployed projects; Vercel env vars (sourced from 1Password) for Vercel-deployed; AWS Parameter Store for non-secret config.
3. **CI authentication:** GitHub Environment Secrets for non-AWS CI creds + AWS OIDC for AWS access. No long-lived AWS access keys.
4. **Rotation:** Auto where natively supported (RDS, etc.); the head agent (in scrummaster mode) surfaces secrets >90 days old in the weekly digest.
5. **Non-prod data:** Production data is forbidden in dev/staging. Factory-generated seed data (factory_boy / fishery from ADR-0004) is the source of truth for non-prod.
6. **PII tagging in the data model:** Fields containing PII are tagged at the schema level. Logging libraries, scrubbing scripts, and serializers consume the tags to know what to redact.

## Consequences

### Positive

- **No plaintext secrets on disk** outside of 1Password's encrypted store.
- **No long-lived cloud access keys anywhere.** OIDC tokens are short-lived; per-environment IAM roles scope access narrowly.
- **PII never leaves prod.** The non-prod data rule eliminates an entire class of leak.
- **AI agents have safe access patterns.** Each agent (or environment) can be granted exactly the IAM permissions it needs, scoped to one environment.
- **SAP-C02 portfolio signal.** AWS Secrets Manager + IAM + OIDC is canonical SAP-C02 material implemented correctly.
- **Rotation that won't break things.** Auto-rotation is bounded to services that natively support reversible rotation; everything else is reminder-based, not enforcement-based.

### Negative

- **1Password subscription required.** ~$3/mo. Acceptable cost for the DX gain.
- **Per-AWS-account OIDC setup.** ~30 min one-time per AWS account. Templates and scripts amortize this.
- **Investment in factory data.** Realistic factories take effort to write — but factory_boy/fishery are mature, and the test-writer agent can generate them from data models.
- **Cross-cutting complexity.** This standard touches ADR-0004 (testing/factories), ADR-0005 (gitleaks scanning), ADR-0009 (Observability — logging/PII redaction), and ADR-0007 (IaC — IAM roles for CI authentication). Coordination required across these standards.

### Neutral

- We're committed to 1Password as the personal vault. A future move to Bitwarden / Doppler / etc. is mechanical (replace `op run` with the alternative's equivalent).
- The PII tag mechanism (schema-level annotation) is consumer-driven — it has value only if the logging/serializer/scrubber code actually reads the tags. The doc-keeper and architect agents will track this.

## Pros and Cons of the Options

### Sub-decision 1: Personal vault for local development

| Option | Trade-off |
|---|---|
| **1Password CLI** (chosen) | Excellent DX (`op run`), cross-cloud, ~$3/mo, works for sharing if a future collaborator joins. |
| **AWS Secrets Manager from local** (via `aws-vault`) | One vault for everything; AWS-only; awkward DX from local. |
| **`.env.local` files (gitignored)** | Free; secrets sit in plaintext on disk; no rotation; no audit. Real risk. |
| **SOPS (encrypted in git)** | Free; complex key management; awkward DX; secret leaks if key leaks. |

### Sub-decision 2: Deployment vault

| Option | Trade-off |
|---|---|
| **Single deployment vault for all stacks** (e.g., AWS Secrets Manager everywhere) | Consistent; AWS-Secrets-Manager-from-Vercel is awkward. |
| **Per-stack defaults** (chosen) — AWS Secrets Manager for AWS; Vercel env for Vercel | Fits the deployment grain; uses native integration. |
| **HashiCorp Vault** | Cloud-agnostic, powerful; massive overkill for solo work. |

### Sub-decision 3: AWS Secrets Manager vs. Parameter Store

| Option | Trade-off |
|---|---|
| **Secrets Manager** (chosen for actual secrets) | Built-in rotation for RDS/etc.; ~$0.40/secret/month; the SAP-C02-canonical answer. |
| **Parameter Store (SecureString)** | Free for standard params; no built-in rotation; less feature-rich. Used for non-secret config. |

We use **both**: Secrets Manager for actual secrets (with rotation needs); Parameter Store for non-secret config (feature flags, log levels). Separation matters because secrets need audit logging and rotation; config doesn't.

### Sub-decision 4: CI authentication to AWS

| Option | Trade-off |
|---|---|
| **Long-lived AWS access keys in GitHub Secrets** | Simplest; long-lived cloud keys are the #1 cloud breach vector. Bad practice. |
| **AWS OIDC (federated, short-lived tokens)** (chosen) | No static AWS keys anywhere; per-environment IAM scoping; one-time setup (~30min/account); SAP-C02-canonical. |
| **Vault-sync to GitHub at CI time** | Single source of truth; more moving parts; sync failures break CI. |

### Sub-decision 5: Rotation policy

| Option | Trade-off |
|---|---|
| **No formal policy** | Zero overhead; old secrets accumulate; breach blast radius grows. |
| **Auto where supported; 90-day reminder elsewhere** (chosen) | Catches RDS auto; manual cadence keeps the rest fresh; agent-driven reminder doesn't depend on human discipline. |
| **Quarterly mandatory rotation everywhere** | Maximum hygiene; high friction; can break integrations at 3am. |

### Sub-decision 6: Non-prod data handling

| Option | Trade-off |
|---|---|
| **Prod data forbidden in non-prod** (chosen) | Cleanest privacy posture; PII never moves downstream; needs investment in factory data. |
| **Prod data allowed if scrubbed** | Realistic test data; scrubbing scripts rot; one missed field = breach. |
| **Prod data freely copied** | Easiest bug repro; catastrophic privacy posture. |

## Implementation notes

- Standards doc: [`docs/standards/07-secrets.md`](../standards/07-secrets.md).
- Bootstrap script (`scripts/new-project.sh` — forthcoming) will create the OIDC IAM role per environment, generate the env templates, and seed factory scaffolds.
- Secret-leak runbook (`docs/runbooks/secret-leak.md`) will be authored as part of the documentation standard (Task #8).
- The PII tagging convention will be operationalized in the per-stack templates (Task #14): factory data uses tags, logging configs read tags.
- Cross-cuts with the AI workflows standard (ADR-0011): the `code-reviewer` and `security-reviewer` agents check for secrets in PRs and verify PII fields are tagged. Operationalized in their system prompts.

## Links

- [1Password Developer Tools](https://developer.1password.com/) — `op run`, vault references.
- [AWS Secrets Manager User Guide](https://docs.aws.amazon.com/secretsmanager/) — rotation, integration patterns.
- [GitHub OIDC + AWS](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services) — the canonical setup.
- [AWS Well-Architected Security Pillar](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/) — relevant for SAP-C02.
- [factory_boy](https://factoryboy.readthedocs.io/) (Python), [fishery](https://github.com/anza-information-systems/fishery) (TS) — factory data tooling.
- [gitleaks](https://github.com/gitleaks/gitleaks) — secret scanning.
- ADR-0003 (CI/CD), ADR-0004 (Testing) — secrets posture supports those decisions.
- [MADR 4.x](https://adr.github.io/madr/) — ADR format used.
