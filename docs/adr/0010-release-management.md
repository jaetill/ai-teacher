# ADR-0010: Release Management — SemVer + release-please + Auto-merge Release PRs

- **Status:** Accepted
- **Date:** 2026-05-08
- **Deciders:** Jason
- **Tags:** release-management, semver, release-please, ai-autonomy

> Format: MADR 4.x (bundled sub-decisions form). See `template.md`.

## Context and Problem Statement

ADR-0002 (Source Control) established Conventional Commits + squash merge. ADR-0003 (CI/CD) established AI shipping authority + tag-based prod promotion + the principle that human involvement is reserved for ADR-gated decisions only. ADR-0009 (Observability) added Sentry release tracking. What's left is the release process itself: which versioning scheme, which engine, what the changelog looks like, and how the rare "I want to look at this release before it ships" case is handled.

The question: how do releases happen end-to-end, with the human truly out of the loop in normal operation but available for genuinely-serious cases?

This ADR bundles five sub-decisions because versioning, engine, changelog, hotfix, and the human-escape-hatch model are interdependent.

## Decision Drivers

- **AI-out-of-loop principle** (ADR-0003 as refined by user pushback). Routine releases must not require human review.
- **Conventional Commits already locked** (ADR-0002). The release engine must consume them natively.
- **Tag-based prod promotion already locked** (ADR-0003). The engine must produce stable version tags as artifacts.
- **Portfolio polish.** Auto-generated changelogs are functional; AI narrative on user-visible releases is portfolio-grade.
- **Genuinely-serious case.** Some releases (1.0 launch, major version with breaking changes) warrant a "look once before going public" gate — but as opt-in, not default.
- **Emergency case.** Auto-rollback failures and equivalent fires need a manual override path that bypasses the standard flow.
- **Solo cost discipline.** Setup and ongoing labor must be near-zero. Configuration over invention.

## Considered Options

The bundle has five sub-decisions:

- **Sub-decision 1 — Versioning scheme:** chose **SemVer 2.0**
- **Sub-decision 2 — Release engine:** chose **release-please**
- **Sub-decision 3 — Changelog format:** chose **Conventional auto-generated + AI narrative on majors/features**
- **Sub-decision 4 — Hotfix process:** chose **Standard auto flow + manual emergency override**
- **Sub-decision 5 — Human-escape-hatch model:** chose **Auto-merge release PRs by default + opt-in `release-block` label**

## Decision Outcome

We adopt:

1. **SemVer 2.0** for all projects. Conventional Commits drive bumps automatically (`feat:` minor; `fix:` patch; breaking changes major post-1.0, minor pre-1.0).
2. **release-please** as the release engine. It opens release PRs based on accumulated Conventional Commits; merging produces tags; tags trigger deploys per ADR-0003.
3. **Conventional Changelog auto-generated** as the canonical `CHANGELOG.md`. The `release-captain` subagent **enhances** the GitHub Release description with a "What this means for you" narrative on major version bumps, breaking changes, or releases with substantial user-visible features.
4. **Standard hotfix flow:** commit `fix:` to main → release-please opens release PR → release-captain auto-merges → tag → deploy. Total time: 5–15 min. **Manual emergency override workflow** exists for genuine emergencies; using it triggers a postmortem ADR.
5. **Release PRs auto-merge by default.** The `release-captain` subagent owns this end-to-end. The opt-in **`release-block` label** is the escape hatch — applied to a release PR by the human when they want to look first (rare; target <2 uses per year).
6. **Continuous cadence** — no schedule. Releases ship when commits warrant.
7. **release-captain subagent's authority** is autonomous: enhance notes, auto-merge release PRs, trigger Sentry release, publish packages, post announcements. Pause + escalate on the `release-block` label or on anomalies.

## Consequences

### Positive

- **Zero human touchpoints in normal release flow.** Aligns with the principle from ADR-0003 (as refined): human involvement is reserved for ADR-gated decisions, not routine releases.
- **Hotfixes are fast.** 5–15 min from commit to prod via the standard flow.
- **Major version bumps still get human-quality release notes** because the `release-captain` agent drafts narrative; the human can intervene via `release-block` if they want a different framing.
- **Emergency override exists** but isn't the default. The friction (postmortem ADR triggered) makes it a real "break-glass" mechanism, not a routine bypass.
- **release-captain owns the publish lifecycle**: source maps, Sentry release tracking, package publishing, announcements. Each of those is one less thing that can be forgotten.
- **Portfolio signal.** "Releases ship autonomously with AI-generated narrative; human-in-the-loop is opt-in via label" is a differentiating story.

### Negative

- **Trust assumption.** release-captain is auto-merging without human review. Mitigated by: (a) all commits in the release have already passed their PR-time gates including ADR-gated checks; (b) anomaly detection in release-captain's prompt; (c) calibration sample in the digest for the first weeks of operation.
- **Loss of "marketing moment" control.** Without the `release-block` label being remembered, releases ship whenever release-captain decides the bundle is ready — no coordinated launch timing for things like 1.0. Mitigated by: the label is cheap; setting `prerelease: true` for upcoming significant releases is also available.
- **Hotfix shipping alongside unrelated pending changes.** Acceptable because main is always shippable per ADR-0002. If something on main isn't ready, that's a source-control violation, not a release problem.
- **Release-captain agent is a load-bearing piece of automation.** If it fails (Sentry release creation breaks, publish fails), the deploy itself is fine but the metadata isn't complete. Mitigated by: retry-with-backoff in the agent's prompt; failures escalate to head agent.

### Neutral

- We're locking in to release-please. Alternatives (semantic-release, manual tagging) remain available if release-please's behavior changes adversely; migration is mostly mechanical.
- Pre-releases (`-rc.N`) are skipped by default. Enabled per-project via the project's own ADR.
- The `release-block` label may rarely get used. That's fine — its existence is what matters; it gives the human a "break glass *to slow down*, not to override" path that's distinct from the emergency-deploy override.

## Pros and Cons of the Options

### Sub-decision 1: Versioning scheme

| Option | Trade-off |
|---|---|
| **SemVer 2.0** (chosen) | Industry default; release-please native; clear compatibility signal; maps cleanly to Conventional Commits. |
| **CalVer** (YYYY.MM.PATCH) | Predictable; date is informative; doesn't signal compatibility; less common in libraries. |
| **ZeroVer** (stay at 0.x forever) | Honest about "things break here"; loses major-version-as-stability signal once past first user. |

### Sub-decision 2: Release engine

| Option | Trade-off |
|---|---|
| **release-please** (chosen) | Opens a release PR per release-worthy batch; the PR is the artifact release-captain operates on; native Conventional Commits; multi-language support; well-maintained by Google. |
| **semantic-release** | Tags on every merge; no release-PR concept; would couple release decisions to feature merges. |
| **Manual `git tag` + `gh release create`** | Full control; defeats AI shipping authority. |

### Sub-decision 3: Changelog format

| Option | Trade-off |
|---|---|
| **Conventional auto-generated + AI narrative on majors/features** (chosen) | Canonical `CHANGELOG.md` is auto-generated and never rots; narrative goes on GitHub Release page for portfolio polish; release-captain decides when narrative is warranted. |
| **Conventional auto-generated only** | Simplest; less user-friendly framing for major releases. |
| **Keep a Changelog (manually curated)** | Most reader-friendly; rots; duplication with auto-gen. |
| **Both, separately maintained** | Full picture; two things to maintain. |

### Sub-decision 4: Hotfix process

| Option | Trade-off |
|---|---|
| **Standard auto flow + manual emergency override** (chosen) | Single pattern in normal cases; truly auto; emergency lever for genuine fires. |
| **Surgical hotfix branch off prod tag** | Surgical — only the fix ships; special case in source control conventions; adds complexity. |
| **Skip emergency override entirely** | Simpler; no break-glass for fires. |

### Sub-decision 5: Human-escape-hatch model

This is the sub-decision that emerged during proposal review when the user noted a residual contradiction with ADR-0003. The original proposal had treated the release PR as a "second human touchpoint." The user pushed back: that contradicts the AI-out-of-loop principle.

| Option | Trade-off |
|---|---|
| **Auto-merge release PRs + opt-in `release-block` label** (chosen) | Aligned with ADR-0003 (AI is the gate; human involvement is opt-in for genuinely-serious cases). The label is cheap and gives the human a slow-down path without forcing review by default. |
| **Always auto-merge release PRs (no escape hatch)** | Maximally aligned with AI-out-of-loop; loses the "I want to look at this 1.0 launch" case. |
| **Always require human merge of release PRs (the pre-pushback proposal)** | Contradicts ADR-0003; rots under fatigue. |
| **Auto-merge minor/patch; require human for major** | Reasonable rule but adds a fixed gate that doesn't match the user's actual decision points (sometimes a minor release is significant; sometimes a major is just a renaming). |

The label-based escape hatch is the right answer because it puts the decision *to slow down* in the human's hands explicitly, rather than forcing them into the loop on every release.

## Implementation notes

- Standards doc: [`docs/standards/09-release-management.md`](../standards/09-release-management.md).
- ADR-0003's standards doc was updated in the same change to clarify "zero human touchpoints in normal flow" rather than the residual "two touchpoints" framing.
- Reusable workflow `workflows/release.yml` runs release-please. Reusable workflow `workflows/emergency-deploy.yml` provides the manual override.
- The `release-captain` subagent's system prompt operationalizes §7 of the standards doc; authored as part of ADR-0011 (AI workflows).
- The `release-block` label is added to every project's GitHub label set by the bootstrap script.
- Sentry release integration uses Sentry CLI in the release workflow; configured per-env via `SENTRY_AUTH_TOKEN` from the secrets vault (per ADR-0006).

## Links

- [Semantic Versioning 2.0](https://semver.org/) — versioning scheme.
- [release-please](https://github.com/googleapis/release-please) — release engine.
- [Conventional Commits 1.0](https://www.conventionalcommits.org/) — drives bumps.
- [Keep a Changelog](https://keepachangelog.com/) — tone reference for the AI narrative section.
- [Sentry release tracking](https://docs.sentry.io/product/releases/) — release-aware error grouping.
- ADR-0002 (Source Control) — Conventional Commits + squash merge supply the input to release-please.
- ADR-0003 (CI/CD) — AI shipping authority + tag-based prod promotion frame this ADR's auto-merge model.
- ADR-0006 (Secrets) — Sentry token storage; npm/PyPI publishing tokens.
- ADR-0009 (Observability) — Sentry release entries; source map upload.
- [MADR 4.x](https://adr.github.io/madr/) — ADR format used.
