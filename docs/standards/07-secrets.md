# Standard 07 — Secrets Management

**Status:** 🟩 Decided (2026-05-08)
**ADR:** [ADR-0006](../adr/0006-secrets.md)

How secrets are stored, accessed, rotated, and kept out of places they don't belong. This is the standard the live-data Game Night project is leaning on most directly.

## Summary

| Concern | Choice |
|---|---|
| Personal vault (local dev) | **1Password CLI** (`op run`) |
| Deployment vault | Per-stack: **AWS Secrets Manager** (AWS); **Vercel env vars** (Vercel) |
| CI authentication | **GitHub Environment Secrets** + **AWS OIDC** (no long-lived AWS keys) |
| Rotation | Auto where supported; **scrummaster** surfaces >90-day-old secrets weekly |
| Non-prod data | **Prod data forbidden in non-prod**; factory-generated seed data; PII-tagged data model |

## 1. The two-vault model

There are two distinct vaults serving different jobs:

| Vault | Purpose | Owned by |
|---|---|---|
| **Personal vault** | Your own API keys, dev creds, third-party service tokens used during development | You (1Password account) |
| **Deployment vault** | Application secrets used by deployed services (DB passwords, app-internal API keys, third-party prod creds) | The platform / cloud account |

These are separate because they have different audiences (you vs. the running app), different lifecycles (rotated by you vs. by automation), and different blast radii.

## 2. Personal vault — 1Password CLI

**Tool:** [1Password CLI (`op`)](https://developer.1password.com/docs/cli/)

### Workflow

Secrets live in a 1Password vault. The CLI injects them into a process's environment without writing them to disk:

```bash
# In a project directory, runs the dev server with secrets from 1Password
op run --env-file=.env.local.template -- pnpm dev
```

Where `.env.local.template` looks like:

```
DATABASE_URL=op://MyVault/MyApp Dev/database_url
STRIPE_SECRET_KEY=op://MyVault/MyApp Dev/stripe_secret_key
```

The references (`op://...`) point to fields in the 1Password vault. `op run` reads them, sets them as env vars in the child process, and exits cleanly.

### Conventions

- **`.env.local.template`** is committed (it's just references, not secrets).
- **`.env.local`** is gitignored. It should not exist long-term — `op run` is the workflow.
- **`.env.example`** is committed and documents what secrets are needed (with placeholder/example values, never real ones).
- **Real secret values never sit on disk** outside of 1Password's encrypted store.

### Onboarding a new project

```bash
op signin                                  # one-time per machine
op vault create MyApp                      # if the vault doesn't exist
op item create --vault MyApp --title "MyApp Dev" \
  database_url="postgres://..." \
  stripe_secret_key="sk_test_..."
```

The bootstrap script (`new-project.sh`) generates `.env.local.template` based on the project's declared secrets needs and prints onboarding instructions.

## 3. Deployment vault — per-stack defaults

### AWS-deployed projects (Lambda, ECS, EC2, etc.)

**Vault:** AWS Secrets Manager.

- One Secret per logical secret (not one Secret per env var). Use JSON-structured secrets where multiple values cluster.
- Secrets are scoped per environment: `<project>/<env>/<name>` (e.g., `game-night/prod/database`).
- Apps read secrets at startup, cache for the process lifetime.
- For Lambda: use the [AWS Secrets Manager Lambda Extension](https://docs.aws.amazon.com/secretsmanager/latest/userguide/retrieving-secrets_lambda.html) (cached, automatic refresh).
- For ECS: inject via task definition `secrets` (Secrets Manager → env var, managed by ECS).
- IAM policy: each environment's compute role has read access to that environment's secrets only. Cross-environment access requires an ADR.

### Vercel-deployed projects (Next.js, etc.)

**Vault:** Vercel's native env vars, sourced from 1Password.

- Vercel env vars are scoped per environment (Development, Preview, Production).
- Sync from 1Password to Vercel via `op` + `vercel env add`. The sync script lives in `scripts/sync-vercel-env.sh` (templated; project-specific).
- Re-sync triggered manually or on secret change in 1Password (no live sync — that creates failure modes).

### Non-secret config

- Non-secret configuration (feature flags, log levels, region, etc.) goes in **AWS Parameter Store** (free for standard parameters) for AWS projects, or per-platform native env vars for others.
- The principle: secrets in Secrets Manager, config in Parameter Store / env vars. Don't mix.

## 4. CI authentication — GitHub + AWS OIDC

No long-lived AWS access keys live in GitHub. CI authenticates to AWS via OIDC, getting a short-lived token per workflow run.

### Setup (one-time per AWS account)

1. Add GitHub as an OIDC identity provider in IAM (`token.actions.githubusercontent.com`).
2. Create one IAM role per environment (`<project>-github-dev`, `<project>-github-staging`, `<project>-github-prod`).
3. Each role's trust policy specifies the GitHub repo + branch + environment that may assume it.
4. Each role's permission policy is narrowly scoped to what CI needs in that environment (deploy, read secrets, etc.).

### CI workflow usage

```yaml
permissions:
  id-token: write
  contents: read

jobs:
  deploy:
    environment: prod
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/game-night-github-prod
          aws-region: us-east-1
      - run: ./deploy.sh
```

### GitHub Environment Secrets (for non-AWS CI secrets)

For things that aren't AWS (third-party API tokens used in CI, etc.): GitHub Environment Secrets, scoped per environment, accessed via `${{ secrets.NAME }}` in workflows.

## 5. Rotation policy

| Secret type | Rotation cadence | Mechanism |
|---|---|---|
| RDS / Aurora master passwords | Auto, 30 days | Secrets Manager native rotation |
| API keys for AWS services | Quarterly (manual) | scrummaster reminder |
| Third-party API tokens (Stripe, etc.) | Annually | scrummaster reminder |
| App-internal API keys (service-to-service) | On staff change or compromise | Manual |
| Personal vault items | At your discretion | Manual via 1Password |
| AWS IAM access keys (if any exist) | They shouldn't exist; OIDC replaces them | n/a |

**Reminder mechanism:** the `scrummaster` agent's weekly digest includes a "Secrets >90 days old" section, listing items by name (not value) with their last-rotation timestamp. You decide which ones to act on.

**No automated mandatory rotation** for non-AWS-native secrets. Auto-rotation that breaks an API integration at 3am is worse than slightly older credentials.

## 6. Non-prod data handling — prod data forbidden

The principle: **production data never lives in non-production environments**. PII never moves downstream.

### Seed data

- Dev and staging databases are populated by **factory-generated seed data** (factory_boy / fishery from Standard 03).
- Factories live in `tests/factories/` (or `src/factories/` for non-test seeding) and produce realistic-but-synthetic data.
- The bootstrap script generates a starter set of factories from the data model.

### Reproducing prod-only bugs

When a bug exists only with prod data shape:

1. Identify the minimum data needed (a handful of records, not a database).
2. Either (a) hand-construct synthetic data matching the shape, or (b) scrub a prod export via a documented one-off script.
3. Use it locally only, never deployed.
4. **Destroy after use** — don't let it sit in your `~/Downloads`.

A scrubbing script template (`scripts/scrub-export.py`) lives in the platform; per-project adaptations are documented in the project's runbooks.

### PII tagging in the data model

Fields that contain PII are tagged in the data model:

```python
# Python (SQLAlchemy / Pydantic) — using a custom field annotation
class User(Base):
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String, info={"pii": True})
    display_name: Mapped[str] = mapped_column(String, info={"pii": True})
    score: Mapped[int]  # not PII
```

```typescript
// TypeScript (Zod / Drizzle) — using a custom decorator or naming convention
const userSchema = z.object({
  id: z.number(),
  email: z.string().email().describe('PII'),
  displayName: z.string().describe('PII'),
  score: z.number(),
});
```

The tags are consumed by:

- **Logging library:** scrubs PII fields before writing (cross-cuts with observability).
- **Scrubbing scripts:** automatically replace tagged fields with synthetic values.
- **API serializers:** can blanket-redact tagged fields based on caller context (e.g., admin views vs. public).

## 7. Secret scanning (cross-cut with quality gates)

| Where | Tool | Behavior |
|---|---|---|
| Pre-commit | **gitleaks** | Blocks commit if secret-shaped string detected |
| PR | **gitleaks** + **GitHub native secret scanning** | Blocks merge if detected |
| Repo (continuous) | **GitHub secret scanning** | Notifies + auto-revokes for partner secrets (Stripe, AWS, etc.) |

If a secret leaks: **rotate immediately**, then triage how it leaked. The platform's runbook (`docs/runbooks/secret-leak.md`, forthcoming) documents the rotation procedure.

## 8. Environment variable conventions

| Variable name pattern | Meaning |
|---|---|
| `<APP>_<COMPONENT>_<NAME>` | Secret or config (e.g., `GAME_NIGHT_DB_URL`, `GAME_NIGHT_STRIPE_KEY`) |
| `<APP>_<COMPONENT>_<NAME>_FILE` | Path to a file containing the secret (Docker secret pattern) |
| `NODE_ENV`, `PYTHON_ENV` | Standard runtime env (production / development / test) |

- Don't use bare names (`DATABASE_URL`) — namespace them by app to avoid collision.
- Boolean env vars use `0`/`1` or `true`/`false`. The application code parses; document the convention.

## 9. Setup checklist

When bootstrapping a new project, the `new-project.sh` script will:

- [ ] Create a 1Password vault for the project (or prompt to use an existing one)
- [ ] Generate `.env.local.template` from declared secret needs
- [ ] Add `.env.example` with documented (placeholder) values
- [ ] Add `.env.local` and `.env*` to `.gitignore`
- [ ] Configure gitleaks pre-commit hook
- [ ] If AWS-deployed: create IAM OIDC roles (one per environment), output ARNs, save to GitHub Environment Secrets
- [ ] If AWS-deployed: create starter Secrets Manager secrets per environment with placeholder values
- [ ] If Vercel-deployed: generate `scripts/sync-vercel-env.sh`
- [ ] Add factory data scaffolding under `tests/factories/`
- [ ] Add `docs/runbooks/secret-leak.md` from template
- [ ] Add `docs/runbooks/rotate-secret.md` from template

## 10. Anti-patterns to avoid

- ❌ **Committing `.env` files.** Gitignored doesn't help if it's already pushed. gitleaks pre-commit catches it before it happens.
- ❌ **Hardcoding secrets in source.** Even in tests. Use factory generators or env injection.
- ❌ **Long-lived AWS access keys in GitHub.** Use OIDC. Always.
- ❌ **Sharing secrets in Slack / email / chat.** Use 1Password sharing or a vault.
- ❌ **Copying prod data to dev for "convenience."** Use factories.
- ❌ **Assuming gitignore is enough.** It catches accidents; gitleaks catches the rest.
- ❌ **Mixing secrets and non-secret config in the same store.** Secrets get audit logging; config doesn't need it. Separation matters.
- ❌ **Auto-rotation that no one tests.** Rotation that fails at 3am with no rollback is worse than slightly older creds.
