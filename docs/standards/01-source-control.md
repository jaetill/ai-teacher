# Standard 01 — Source Control

**Status:** 🟩 Decided (2026-05-08)
**ADR:** [ADR-0002](../adr/0002-source-control.md)

This document specifies how source control is operated across all projects derived from this platform. It is operational reference: *what to do*. The reasoning behind each decision lives in ADR-0002.

## Summary

| Concern | Choice |
|---|---|
| Branching strategy | GitHub Flow |
| Branch naming | `<type>/<short-description>` |
| Commit message format | Conventional Commits |
| Commit signing | SSH commit signing |
| Merge strategy | Squash merge |
| Branch protection on `main` | Strict (PR + checks + signed + linear) |

## 1. Branching strategy — GitHub Flow

- **`main`** is the only long-lived branch and is always in a deployable state.
- All work happens on **short-lived feature branches** cut from `main`.
- Changes return to `main` via a Pull Request with required status checks.
- Direct push to `main` is disallowed by branch protection.
- Multi-environment promotion happens via the deploy pipeline (CI/CD standard), **not** via branches. There is no `develop`, `staging`, or `prod` branch.

## 2. Branch naming

Format: `<type>/<short-kebab-description>`, optionally `<type>/<issue-id>-<short-description>`.

`<type>` is one of the Conventional Commits types:

| Type | Use for |
|---|---|
| `feat` | New user-facing capability |
| `fix` | Bug fix |
| `chore` | Tooling, build, deps, non-functional housekeeping |
| `docs` | Documentation only |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Test additions or changes |
| `ci` | CI configuration changes |
| `perf` | Performance improvement |
| `build` | Build system changes |
| `revert` | Reverts a prior commit |

Examples: `feat/user-login-flow`, `fix/123-null-pointer-in-checkout`, `chore/bump-eslint-9`.

## 3. Commit message format — Conventional Commits

Every commit on `main` (after squash) **must** follow [Conventional Commits 1.0](https://www.conventionalcommits.org/):

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

- `<type>` matches the branch-name vocabulary above.
- `<scope>` is optional but recommended for monorepos (`feat(api): ...`).
- Breaking changes are signaled with `!` after type/scope (`feat!: drop Node 18 support`) or a `BREAKING CHANGE:` footer.
- The PR title is the commit message that lands on `main` after squash merge — write the PR title in Conventional Commit format.
- Branch commits (before squash) can be messy WIP — the discipline applies at the PR/merge level.

## 4. Commit signing — SSH

- All commits to `main` **must be signed** with the same SSH key used for push.
- One-time setup:
  ```bash
  git config --global gpg.format ssh
  git config --global user.signingkey ~/.ssh/id_ed25519.pub
  git config --global commit.gpgsign true
  ```
- Then add the SSH key as a *signing key* on GitHub (separate from authentication key registration; same key, different setting).
- Branch protection requires verified signatures; unsigned commits will be rejected.

## 5. Merge strategy — Squash merge

- All PRs merge into `main` via **squash merge**. Other strategies (merge commit, rebase) are disabled at the repository level.
- One PR = one commit on `main` = one Conventional-Commits message = one release-please input.
- The squash commit message is the PR title (Conventional Commits) and the body is the PR description (or omitted).

## 6. Branch protection on `main`

The following rules **must** be enabled on `main` for every project repo:

- Require a pull request before merging
- Require approvals: 0 (solo) but PRs must still pass status checks
- Require status checks to pass:
  - All checks in `ci-<stack>.yml` (lint, type, test, security)
  - `claude-pr-review` check (the AI code-reviewer + security-reviewer)
- Require branches to be up to date before merging
- Require **signed commits**
- Require **linear history**
- Require conversation resolution before merging
- Do not allow force pushes
- Do not allow deletions
- Apply rules to administrators (no admin bypass — gates only work if they have teeth)

These are settable via GitHub UI under Settings → Branches, or via Terraform / GitHub CLI as part of the bootstrap script.

## 7. Pull Request conventions

- **PR title:** Conventional Commits format (it becomes the squash commit).
- **PR body:** Use the project's PR template. At minimum: what changed, why, how it was verified.
- **Required PR checks:** as listed in branch protection.
- **Reviewer:** the `code-reviewer` and `security-reviewer` subagents auto-trigger on every PR via GitHub Actions. The author (you) is the human approver.

## 8. CODEOWNERS

Solo workflow: keep a `CODEOWNERS` file with `* @<your-github-handle>` to make ownership explicit (and to enable required-reviewer rules to attribute correctly even with 0-approvals required). When a future collaborator joins, add them here.

## 9. Setup checklist

When bootstrapping a new project, the `new-project.sh` script will:

- [ ] Initialize git repo with `main` as the default branch
- [ ] Create `CODEOWNERS`
- [ ] Create `.gitignore` (stack-appropriate)
- [ ] Install `commitlint` + `husky` (or equivalent per stack) to enforce Conventional Commits at commit time
- [ ] Create initial PR template under `.github/pull_request_template.md`
- [ ] Create initial GitHub Actions: `ci-<stack>.yml` and `claude-pr-review.yml` (referenced from this platform's reusable workflows)
- [ ] Push to GitHub and apply branch protection rules via `gh` CLI

## 10. Tooling

| Concern | Tool |
|---|---|
| Conventional Commits enforcement (client-side) | `commitlint` + `husky` (Node) or `commitizen` + `pre-commit` (Python) |
| Conventional Commits enforcement (server-side) | `commitlint-github-action` in CI |
| Signed commit enforcement | GitHub branch protection rule |
| Branch protection enforcement | GitHub CLI (`gh api`) called by bootstrap script |
| Release automation (downstream) | `release-please` — see Release Management standard (forthcoming) |

## 11. Anti-patterns to avoid

- ❌ **Long-lived feature branches.** Anything older than ~1 week is overdue to merge or split.
- ❌ **Branches per environment.** No `develop`, `staging`, `prod` branches. Promotion is by deploy pipeline, not by branch.
- ❌ **Direct push to `main`.** Defeats the AI review gate. Use a PR even for one-line fixes.
- ❌ **Free-form commit messages on `main`.** Breaks release automation downstream.
- ❌ **Merge commits or rebase merges.** Disables release-please's reading of main as a sequence of one-PR-one-decision events.
- ❌ **Admin bypass of branch protection.** Gates with admin bypass aren't gates.
