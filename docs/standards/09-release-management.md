# Standard 09 — Release Management

**Status:** 🟩 Decided (2026-05-08)
**ADR:** [ADR-0010](../adr/0010-release-management.md)

How releases happen. Most of this is determined by upstream standards (Conventional Commits + squash merge from ADR-0002; tag-based prod promotion + AI shipping authority from ADR-0003; Sentry release tracking from ADR-0009). What this standard adds: the versioning scheme, the release engine config, the release-captain agent's responsibilities, and the escape hatches for the rare cases when a human wants in.

## Summary

| Concern | Choice |
|---|---|
| Versioning | **SemVer 2.0** |
| Engine | **release-please** (Google) |
| Changelog | **Conventional auto-generated** + AI-narrative intro on majors/feature releases |
| Pre-releases | Skip; per-project ADR if needed |
| Cadence | Continuous; no schedule |
| Hotfix flow | **Fully automated standard flow** (release-captain auto-merges); manual emergency override exists |
| Release artifacts | Changelog + source archive + SBOM + signed tag (always); package/container/migration guide (conditional) |
| Human touchpoints | None in normal flow; opt-in `release-block` label; manual emergency override |
| release-captain agent | Autonomous end-to-end including auto-merging the release PR |

## 1. Versioning — SemVer 2.0

[Semantic Versioning 2.0](https://semver.org/) — `MAJOR.MINOR.PATCH`:

- **MAJOR** — incompatible API changes
- **MINOR** — backward-compatible new functionality
- **PATCH** — backward-compatible bug fixes

Conventional Commits drive the bumps:

| Commit type | Bump |
|---|---|
| `feat:` | MINOR |
| `fix:` | PATCH |
| `feat!:` or any commit with `BREAKING CHANGE:` footer | MAJOR (post-1.0); MINOR (pre-1.0) |
| `chore:`, `docs:`, `refactor:`, `test:`, `ci:`, `build:`, `perf:` | No bump (unless they touch user-visible behavior, in which case use `feat`/`fix`) |

**Pre-1.0 (`0.x`) policy:** breaking changes bump the MINOR (`0.4.0` → `0.5.0`). The "anything can break" connotation of 0.x is preserved. This is release-please's default behavior.

**Reaching 1.0:** declared via a deliberate release with `release-as: 1.0.0` in release-please config. Triggered by an ADR documenting the API stability commitment.

## 2. Engine — release-please

[release-please](https://github.com/googleapis/release-please) is the platform default release engine.

### How it works

1. release-please watches `main` for Conventional Commits.
2. When release-worthy commits accumulate (any `feat:` or `fix:` or breaking change), release-please opens (or updates) a **release PR**.
3. The release PR contains:
   - Updated `CHANGELOG.md`
   - Updated version files (e.g., `package.json`, `pyproject.toml`)
   - The proposed version number
4. The `release-captain` subagent reviews the auto-generated changelog, enhances it with narrative if appropriate, and **auto-merges the PR**.
5. Merging the PR creates the Git tag (e.g., `v1.4.0`) and triggers the deploy workflow per ADR-0003.

### Configuration

`.release-please-config.json` per project:

```json
{
  "release-type": "python",  // or "node", "terraform-module", etc.
  "include-component-in-tag": false,
  "bump-minor-pre-major": true,
  "bump-patch-for-minor-pre-major": true,
  "draft": false,
  "prerelease": false,
  "changelog-sections": [
    {"type": "feat", "section": "Features"},
    {"type": "fix", "section": "Bug Fixes"},
    {"type": "perf", "section": "Performance Improvements"},
    {"type": "deps", "section": "Dependencies", "hidden": false},
    {"type": "revert", "section": "Reverts"},
    {"type": "docs", "section": "Documentation", "hidden": true},
    {"type": "chore", "section": "Miscellaneous", "hidden": true},
    {"type": "refactor", "section": "Refactors", "hidden": true},
    {"type": "test", "section": "Tests", "hidden": true},
    {"type": "ci", "section": "CI/CD", "hidden": true},
    {"type": "build", "section": "Build", "hidden": true}
  ]
}
```

`hidden: true` types are recorded internally but don't appear in the user-facing changelog.

### Workflow file

`.github/workflows/release.yml` (referenced from the platform's reusable workflow):

```yaml
name: release-please
on:
  push:
    branches: [main]
permissions:
  contents: write
  pull-requests: write
  id-token: write
jobs:
  release-please:
    runs-on: ubuntu-latest
    steps:
      - uses: googleapis/release-please-action@v4
        with:
          config-file: .release-please-config.json
          manifest-file: .release-please-manifest.json
```

## 3. Changelog — Conventional auto-generated + AI narrative

### Auto-generated from Conventional Commits

release-please produces `CHANGELOG.md` automatically. Each release section is structured by commit type. Example:

```markdown
## [1.4.0](https://github.com/.../compare/v1.3.0...v1.4.0) (2026-05-15)

### Features
* **auth**: add SSO via Google Workspace ([#234](https://github.com/.../pull/234))
* support multi-game tournaments ([#241](https://github.com/.../pull/241))

### Bug Fixes
* score calculation off-by-one in last round ([#238](https://github.com/.../pull/238))

### Performance Improvements
* batch player updates in 1s windows ([#243](https://github.com/.../pull/243))
```

This is the canonical changelog. No manual editing.

### AI narrative intro (release-captain)

For releases that warrant context (major version bumps; releases with significant user-visible changes), the **release-captain** subagent drafts a narrative paragraph at the top of the release notes:

```markdown
## What this means for you

v1.4.0 introduces SSO via Google Workspace, completing the authentication
overhaul that began with v1.3.0. Existing email/password accounts continue
to work; SSO is opt-in via account settings. Tournament play is now
multi-game by default — see the migration note below if you've been
scripting against the single-game API.

[full Conventional Changelog follows...]
```

The narrative goes on the GitHub Release page (and the published release notes), not into `CHANGELOG.md` itself. `CHANGELOG.md` stays canonical-and-auto-generated.

When release-captain decides a narrative is warranted:

- Major version bump (always)
- Release contains a `feat!:` or `BREAKING CHANGE:` footer (always)
- Release contains 3+ `feat:` commits (often)
- Release follows >2 weeks of accumulated commits (sometimes — significant batch)

Release-captain follows Keep a Changelog's tone for the narrative — clear, user-focused, no jargon.

## 4. Pre-releases — skip by default

For solo work, pre-releases (`1.5.0-rc.1`) duplicate what staging already provides. Skip by default.

A project may opt in via `.release-please-config.json`:

```json
{
  "release-type": "python",
  "prerelease": true,
  "prerelease-type": "rc"
}
```

This is project-specific. Document the rationale in the project's own ADR if enabled.

## 5. Release cadence — continuous

No schedule. release-please opens a release PR whenever release-worthy commits accumulate. release-captain auto-merges it. The pipeline ships. Whatever cadence falls out of actual `feat:` and `fix:` activity is the cadence.

For projects in genuine maintenance mode (rare commits): release PRs may sit open for weeks until release-captain decides there's enough to ship. That's fine; release-captain checks "is there a `feat:` in here? At least one `fix:` aged >7 days?" before merging.

## 6. Hotfix flow — standard auto

Hotfix means "fix that needs to ship now." Use the standard flow:

1. Commit a `fix:` to a branch.
2. Open PR → AI review battery → auto-merge to main.
3. release-please opens (or updates) a release PR with the fix.
4. release-captain auto-merges the release PR.
5. Tag → deploy → prod.

Total time from commit to prod: usually 5–15 minutes. Faster than a hotfix branch would be.

The fix shipping alongside whatever's already pending merge to main is OK because main is always shippable per ADR-0002. If something on main *isn't* ready to ship, that's a violation of source control standards, not a release management problem.

### Manual emergency override

For genuine emergencies — auto-rollback fails AND the standard flow is too slow AND the human is online to drive it — there's a `workflow_dispatch` workflow:

```yaml
name: emergency-deploy
on:
  workflow_dispatch:
    inputs:
      commit_sha:
        description: 'Commit SHA to deploy directly to prod'
        required: true
      reason:
        description: 'Why are we bypassing standard flow? (logged in release notes)'
        required: true
        type: string
```

Using this workflow:

- Bypasses staging
- Logs the reason in the release notes and in the head agent's digest
- Triggers a postmortem ADR within 48 hours
- Should be rare (target: <1 use per year)

## 7. release-captain subagent — concretized

| Trigger | Action |
|---|---|
| release-please opens a release PR | Read the auto-generated changelog. Decide if narrative intro is warranted (per §3 criteria). If yes, draft it and update the GitHub Release description. **Auto-merge the PR.** |
| Release PR auto-merged → tag created | Trigger Sentry release creation. Upload source maps via Sentry CLI. For library projects: trigger PyPI / npm publish. Post release announcement to configured channels (when set up). |
| Major version bump pending | Draft a migration guide section in the release notes. Propose a `migration-vN.md` runbook update (handed to doc-keeper). Still auto-merge. |
| `release-block` label present on the release PR | Pause. Update the PR description with "Auto-merge paused per `release-block` label. Remove label to proceed." Notify head agent in next digest. |
| Anomaly detected (commit with ADR-gated tag but no paired ADR found) | Should never happen — ADR-gated commits can't merge upstream. If it does, pause + escalate to head agent. Defensive. |
| Publish failure (PyPI, npm, container registry) | Retry once with backoff. If still failing, open an issue, mark the release as failed in the GitHub Release page, escalate to head agent. |

The release-captain's authority: auto-merge release PRs in normal operation; pause and escalate on anomalies; never bypass the `release-block` escape hatch.

## 8. Release artifacts

What gets attached to a GitHub Release:

| Artifact | Always | Conditional |
|---|---|---|
| `CHANGELOG.md` section for this version | ✅ | |
| Source archive (auto by GitHub) | ✅ | |
| **SBOM** (Syft, per ADR-0005) | ✅ | |
| **Signed Git tag** (per ADR-0002 SSH signing) | ✅ | |
| GitHub Release description with auto-changelog + AI narrative | ✅ | |
| Sentry release entry with source maps | ✅ | |
| **Published package** (PyPI, npm) | | Library projects only |
| **Container image** (pushed to registry) | | Service projects using containers |
| **Cosign / sigstore signature on artifact** | | Future — added via ADR if/when supply-chain attestation matters |
| **Migration guide** | | Major version bumps |

## 9. The `release-block` label — opt-in escape hatch

For the rare case when the human wants to look at a specific upcoming release before it ships (a 1.0 launch; a particularly significant feature drop; a major version with downstream consumer impact):

1. Apply the `release-block` label to the release-please PR.
2. release-captain detects the label and pauses auto-merge.
3. The PR description is updated with the pause notice.
4. The release sits open until the human removes the label (or closes the PR).
5. Removing the label triggers release-captain's normal flow.

This is intentional, opt-in human involvement. It exists so the *option* is available without forcing the human into the loop by default.

## 10. Setup checklist

When bootstrapping a new project, the `new-project.sh` script will:

- [ ] Add `.release-please-config.json` with stack-appropriate `release-type`
- [ ] Add `.release-please-manifest.json` with initial version `0.1.0`
- [ ] Add `.github/workflows/release.yml` referencing the platform's reusable workflow
- [ ] Add `.github/workflows/emergency-deploy.yml` (rarely used; documented anti-pattern unless genuine)
- [ ] Configure GitHub repo: enable squash merge only (already required by ADR-0002); enable auto-merge feature
- [ ] Add Sentry CLI to release workflow
- [ ] If library project: add publish step (PyPI / npm) with token from secrets
- [ ] If container service: add image build + push to registry
- [ ] Add `release-block` label to repo's label set
- [ ] Document release process in `docs/runbooks/release.md` (mostly: "you don't have to do anything; release-captain handles it")

## 11. Anti-patterns to avoid

- ❌ **Hand-editing `CHANGELOG.md`.** It's generated. Edits get overwritten.
- ❌ **Tagging releases manually.** Defeats release-please. If you need an out-of-band release, use the emergency override workflow.
- ❌ **Skipping the `release-block` label and adding manual review steps to release-please's workflow.** That's the wrong escape hatch — the label exists for a reason.
- ❌ **Using `chore:` or `docs:` for user-visible changes.** They won't trigger a release. If a user notices the change, it's `feat:` or `fix:`.
- ❌ **`feat:` commits on `main` without a corresponding test.** Coverage gates from ADR-0004 catch this; don't bypass.
- ❌ **Releasing on a schedule.** Continuous is the model. Schedules are bureaucracy.
- ❌ **Major version bumps without a migration guide.** release-captain proposes one; don't accept the release without it.
- ❌ **Using the emergency override for non-emergencies.** It triggers a postmortem ADR. Save it for genuine fires.
