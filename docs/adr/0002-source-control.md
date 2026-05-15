# ADR-0002: Source Control Conventions

- **Status:** Accepted
- **Date:** 2026-05-08
- **Deciders:** Jason
- **Tags:** source-control, git, github

> Format: MADR 4.x (bundled sub-decisions form). See `template.md`.

## Context and Problem Statement

Every other standard in this platform (CI/CD, testing, releases, AI workflows) builds on assumptions about how source control is operated. The conventions need locking in before authoring those downstream standards or building any templates.

The question: what bundle of source control conventions gives a solo developer a publicly readable, AI-reviewable, release-automation-ready workflow without ceremony for ceremony's sake?

This ADR bundles five sub-decisions because they only make sense together; flipping any one of them invalidates the others' rationale.

## Decision Drivers

- **Solo developer, public-facing portfolio.** No team to coordinate with, but practices need to *look* professional, not just function.
- **AI-assisted workflow.** Subagents (code-reviewer, security-reviewer, release-captain) need predictable trigger points. PRs are that trigger.
- **Multi-environment deployment.** At least one project (Game Night) handles live user data; dev/staging/prod separation is needed. Source control conventions must compose with environment promotion (the "promote artifacts, not branches" principle adopted in ADR-0003).
- **Release automation.** `release-please` (or equivalent) needs to drive semantic versioning, changelogs, and tagged releases automatically — and it requires a specific commit message format.
- **Portfolio signal.** Verified commit signatures, clean linear history, and readable PR-by-PR main history are visible signals of discipline.

## Considered Options

The bundle has five sub-decisions, each with its own options. Sub-decisions are listed with the chosen option; full pros/cons in *Pros and Cons of the Options* below.

- **Sub-decision 1 — Branching strategy:** chose **GitHub Flow**
- **Sub-decision 2 — Commit message format:** chose **Conventional Commits**
- **Sub-decision 3 — Commit signing:** chose **SSH signing**
- **Sub-decision 4 — Merge strategy:** chose **Squash merge**
- **Sub-decision 5 — Branch protection on `main`:** chose **Strict**
- Plus: branch naming convention `<type>/<short-kebab-description>` matching the Conventional Commits vocabulary

## Decision Outcome

We adopt the bundle:

- **GitHub Flow** branching
- **Conventional Commits** messaging
- **SSH** commit signing
- **Squash merge** strategy
- **Strict** branch protection on `main`
- Branch naming: `<type>/<short-kebab-description>`

The bundle is internally consistent: squash merge requires Conventional Commits at PR-title level; branch protection enforces signing and linear history; GitHub Flow makes the PR the natural AI-review trigger; Conventional Commits enable downstream release automation. None of these choices stands cleanly without the others.

## Consequences

### Positive

- Every change to `main` passes through a PR — a natural and consistent trigger for the AI code-reviewer and security-reviewer subagents.
- Release automation (release-please) can drive version bumps, changelog generation, and tagged releases with no manual labor.
- "Verified" commit signature badges on every commit — visible portfolio signal of discipline.
- Linear, scannable main history. Every commit is one user-facing PR.
- The "promote artifacts, not branches" principle is preserved — main is the single source of truth for what gets deployed everywhere.
- Gates have teeth (no admin bypass), so the user can't shortcut themselves under deadline pressure.

### Negative

- ~30 minutes of one-time SSH-signing setup per machine.
- Slight commit-time friction from Conventional Commits format. Mitigated by `commitizen` interactive prompt and/or having Claude draft commit messages from `git diff`.
- Trivial doc fixes still require a PR (cannot direct-push). Acceptable cost.
- Operating under `commit.gpgsign = true` globally may conflict with other repos using GPG; per-repo override is straightforward but worth noting.

### Neutral

- Existing repos that haven't followed these conventions will need retrofitting (planned: Task #16, deferred per ADR-0001).
- The choice locks in `release-please` as the downstream release automation tool when we get to the release management standard. Alternatives (`semantic-release`) are also Conventional-Commits-driven, so the lock-in is to the format, not the specific tool.

## Pros and Cons of the Options

### Sub-decision 1: Branching strategy

| Option | Trade-off |
|---|---|
| **Trunk-based / direct push to main** | Lowest ceremony; loses the PR as an AI-review trigger. |
| **GitHub Flow** (chosen) | Main + short-lived feature branches + PRs. PR is the universal trigger for AI review and CI gates. |
| **Git Flow** (main + develop + release/* + hotfix/*) | Designed for scheduled releases with multiple in-flight versions. Overkill for solo continuous-delivery workflow; even Vincent Driessen (its author) recommends against it for web apps as of 2020. |

### Sub-decision 2: Commit message format

| Option | Trade-off |
|---|---|
| **Conventional Commits** (chosen) | Industry standard; enables release-please, semantic-release, automated changelog generation, semver bumping. Slight commit-time friction. |
| **Free-form prose** | Zero discipline; kills downstream release automation. |
| **Gitmoji / custom prefix** | Visual scan-ability without the tooling ecosystem; doesn't unlock release automation. |

### Sub-decision 3: Commit signing

| Option | Trade-off |
|---|---|
| **SSH commit signing** (chosen) | ~5 min setup; reuses existing SSH key; modern best practice (Git 2.34+). |
| **GPG signing** | Traditional; painful setup and key management; mostly used because SSH signing didn't exist yet. |
| **No signing** | Visible gap on a portfolio repo; "Verified" badges are cheap professional signal. |

### Sub-decision 4: Merge strategy

| Option | Trade-off |
|---|---|
| **Squash merge** (chosen) | One commit per PR on main → release-please can read it cleanly; WIP commits on the branch don't pollute main; mapping "one PR = one deployable artifact" is crisp. |
| **Merge commit** | Preserves full branch history; main becomes noisy; release-please can't easily distinguish what's user-facing. |
| **Rebase + merge** | Linear history with all commits preserved; requires every branch commit to be Conventional-Commits-clean (high discipline cost). |

### Sub-decision 5: Branch protection

| Option | Trade-off |
|---|---|
| **Strict** (chosen) | PR + status checks + signed commits + linear history + no admin bypass. Gates only work if they have teeth. |
| **Standard** | PR + status checks + no force-push. Doesn't enforce signing or linear history; weaker portfolio signal. |
| **Loose** (no protection) | Friction-free; defeats the entire purpose of the platform. |

## Implementation notes

- Standards doc: [`docs/standards/01-source-control.md`](../standards/01-source-control.md).
- Bootstrap script (`scripts/new-project.sh` — forthcoming) will wire commitlint + husky/pre-commit, create the PR template, push to GitHub, and apply branch protection via `gh api`.
- Reusable GitHub Actions workflow `claude-pr-review.yml` (forthcoming) will invoke the code-reviewer and security-reviewer subagents on every PR.

## Links

- [Conventional Commits 1.0](https://www.conventionalcommits.org/en/v1.0.0/)
- [GitHub Flow guide](https://docs.github.com/en/get-started/quickstart/github-flow)
- Vincent Driessen, [A successful Git branching model — note](https://nvie.com/posts/a-successful-git-branching-model/) (2020 update recommending against Git Flow for continuous-delivery contexts)
- [Git SSH signing docs](https://git-scm.com/docs/git-config#Documentation/git-config.txt-gpgformat)
- [release-please](https://github.com/googleapis/release-please) — downstream consumer of Conventional Commits
- DORA, *Accelerate State of DevOps Reports* — high-performing teams correlate strongly with trunk-based / GitHub Flow patterns and short-lived branches.
- [MADR 4.x](https://adr.github.io/madr/) — ADR format used.
