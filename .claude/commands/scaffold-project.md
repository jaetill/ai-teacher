---
description: Bootstrap a new project from a stack template
---

Bootstrap a new project: $ARGUMENTS.

Expected arguments: `--stack=<python-service|typescript-app|aws-iac>` `--name=<project-name>` `[--target-dir=<path>]`.

## Process

1. **Validate inputs.**
   - Stack must be one of the supported stacks (per Standard 01 stack list).
   - Name must be a valid directory name (kebab-case; no spaces).
   - Target dir defaults to `E:\Users\tille\Documents\Source Code\<name>` (per the global CLAUDE.md workspace).

2. **Run the platform's scaffolding script** (`scripts/new-project.sh` — implementation pending):
   - Copy the per-stack template from `templates/<stack>/` to the target directory.
   - Apply project-name substitutions throughout the template.
   - Initialize git with `main` as default branch (per ADR-0002).
   - Apply branch protection rules via `gh api` (Strict per ADR-0002).
   - Push initial commit + create GitHub repo.
   - Wire reusable workflows from this platform.
   - Set up GitHub Environments (dev, staging, prod) with placeholder secrets.
   - Configure Sentry project (if Sentry credentials available).
   - Create AWS OIDC IAM role (if AWS-deployed and AWS credentials available).
   - Configure Grafana Cloud data source for the new project.
   - Create three CloudWatch Log Groups with retention per ADR-0009.

3. **Bootstrap the AI configuration:**
   - Create `.claude/` in the new project.
   - Copy agent definitions, slash commands, and hook config from `templates/_shared/claude/`.
   - Generate project-specific `CLAUDE.md` (≤200 lines per ADR-0008).

4. **Initial state:**
   - First PR opened automatically: "chore: scaffold project" (Conventional Commits).
   - First release-please tag: v0.1.0.
   - Documentation site at `https://<github-username>.github.io/<name>/`.

5. **Report.** Summary of what was created, links to the repo, the docs site, and any manual setup remaining (e.g., creating the Sentry project if credentials weren't available).

## Anomaly handling

- **Stack not recognized**: list supported stacks and ask the user to specify.
- **Name conflicts with existing project**: refuse; ask for a different name.
- **Required credentials missing** (AWS, Sentry, Grafana): scaffold what's possible; document what manual steps remain in the new project's README.
- **Bootstrap script fails partway**: roll back where possible; document remaining cleanup; do not leave the user with a half-scaffolded project.

## Anti-patterns

- ❌ Don't scaffold to a directory that already exists. Confirm or refuse.
- ❌ Don't skip branch protection. Per ADR-0002, gates only work if applied.
- ❌ Don't create projects without `CLAUDE.md`. The agents need it.
