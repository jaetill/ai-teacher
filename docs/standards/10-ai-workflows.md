# Standard 10 — AI Workflows

**Status:** 🟩 Decided (2026-05-08)
**ADR:** [ADR-0011](../adr/0011-ai-workflows.md)

This standard operationalizes the AI side of the platform that every prior standard has been assuming. It defines the head agent's modes, the 12 specialist subagents' system prompts and triggers, the hook policy, the slash command set, and the discipline around tokens, performance, and autonomy.

## Three guiding principles

> **Token cost discipline.** Cheap models for routine work; expensive models only where reasoning depth justifies. Prompt caching everywhere it applies. Pre-flight cheap checks before invoking expensive agents. Per-agent budgets with alerts.
>
> **Performance discipline.** Same standard as ADR-0007. Agents fan out in parallel where independent. Path-filtered context. Per-trigger time budgets enforced.
>
> **AI-autonomy default.** Each agent's prompt grants explicit authority for its scope. Self-recovery preferred over escalation. Escalation paths are for genuine anomalies, not "to be safe."

These principles are baked into every agent's system prompt and into the hook configuration.

## Summary

| Concern | Choice |
|---|---|
| Architecture | Head agent (orchestrator + decision partner, multiple modes) + 12 specialist subagents (headless workers) |
| Model selection | Tiered: Haiku for routine; Sonnet for reasoning; Opus only for `architect` on ADR-gated PRs |
| Token budgets | ~$15/mo total at solo scale; per-agent caps; prompt caching of stable context |
| Hook policy | Mixed strictness with concrete rules (see §3) |
| Slash commands | 10 commands (see §4) |
| Anomaly handling | Self-recover with retry; escalate only on genuine novelty or repeated failure |

## 1. The two-entity architecture (recap of `templates/_shared/claude/README.md`)

There are two kinds of entity:

### Head agent

The Claude session the human talks to. Holds memory, project state, conversation history. Orchestrates specialist subagents via the Agent/Task tool. Operates in different *modes* — architect, scrummaster, investigator, planner — but these are descriptive moments of one agent, not separate identities.

When a "scheduled scrummaster run" happens (e.g., daily digest), it's the head agent spawning with mode-specific instructions.

### 12 specialist subagents

Headless workers, narrow scope, restricted tools. Each has a focused system prompt. Always invoked by the head agent or by scheduled workflows.

| Subagent | Role | Cadence |
|---|---|---|
| `architect` (headless) | Autonomous ADR drafting from PR diffs when no human is in the conversation | On ADR-gated PR |
| `code-reviewer` | PR review against standards (incl. clarity/naming gap from ADR-0005) | On every PR |
| `security-reviewer` | Injection, secrets, authn/authz, dep CVEs | On every PR |
| `functional-tester` | Functional + integration test authoring/running | On PR + on staging |
| `e2e-tester` | Playwright end-to-end test authoring/running | On merge to main + on tag |
| `test-writer` | Unit test authoring on new/changed code | On PR if coverage drops |
| `doc-keeper` | README, runbook, API doc upkeep, dashboards drift detection | On merge to main |
| `release-captain` | Release notes, version bumps, tagging, publish, Sentry release | On Conventional-Commits-driven release PR |
| `dep-watcher` | Dependabot/Renovate PR review | On dep PRs |
| `incident-responder` | Reactive urgent triage — auto-rollback fails, prod down, paging | Real-time on alert |
| `drift-detector` | IaC drift triage and proposed fixes (per ADR-0007) | Weekly scheduled |
| `triage-bot` | Proactive scanner — gathers logs/errors, classifies, dedupes, files tickets with customer-advocate lens | Daily/weekly + webhook-driven |

## 2. Model selection per agent

The model is part of each agent's contract. Specified in the agent's frontmatter and propagated through all invocations.

| Agent | Model | Cheap-then-escalate? |
|---|---|---|
| `code-reviewer` | Sonnet 4.6 | No |
| `security-reviewer` | Sonnet 4.6 | No |
| `architect` (headless) | Opus 4.6 | No |
| `test-writer` | Sonnet 4.6 | No |
| `functional-tester` | Haiku 4.5 | Escalate to Sonnet on novel test authoring |
| `e2e-tester` | Haiku 4.5 | Escalate to Sonnet on novel test authoring |
| `doc-keeper` | Haiku 4.5 | No |
| `release-captain` | Haiku 4.5 | Escalate to Sonnet for narrative on majors/feature releases |
| `dep-watcher` | Haiku 4.5 | Escalate to Sonnet for major version bumps or unfamiliar deps |
| `incident-responder` | Sonnet 4.6 | No |
| `drift-detector` | Haiku 4.5 | Escalate to Sonnet for fix-PR drafts |
| `triage-bot` | Haiku 4.5 | Escalate to Sonnet for ticket framing |

The head agent uses the model the user is talking to it through (Sonnet 4.6 in interactive use; can be configured otherwise per session).

### Cheap-then-escalate pattern

Several agents (release-captain, drift-detector, triage-bot, dep-watcher, *-tester) use a two-tier prompt structure:

1. **Tier 1 (Haiku):** classify, dedupe, route. If the work is routine, complete it.
2. **Tier 2 (Sonnet):** invoked by Tier 1 when reasoning depth is needed (drafting prose, proposing a non-trivial change, evaluating a major version bump).

Tier 1 invokes Tier 2 explicitly via the Agent/Task tool. Both tiers are the *same agent* (same name, same scope) — the agent's prompt routes appropriately based on the input.

## 3. Hook policy

ADR-0001 / earlier discussion locked in **Mixed** strictness. The concrete rules:

### Block (reject + require explicit confirm to proceed)

| Lifecycle event | Pattern |
|---|---|
| `PreToolUse(Bash)` | `rm -rf /\|sudo \|git push --force.+main\|DROP TABLE\|TRUNCATE\|DELETE FROM .* WHERE 1=1` |
| `PreToolUse(Bash)` | Credential patterns (`AWS_SECRET_ACCESS_KEY=`, etc.) |
| `PreToolUse(Edit\|Write)` | Files matching `**/*.tfstate`, `.env*` (never editable) |

### Warn (surface but don't block)

| Lifecycle event | Action |
|---|---|
| `PostToolUse(Edit\|Write)` for source code | Run formatter on changed files; auto-fix |
| `PostToolUse(Edit\|Write)` for source code | Run linter; surface findings |
| `Stop` if tests failing or dirty tree | Warn; require confirm to proceed |

### Inject (add context to the head agent's prompt)

| Lifecycle event | Inject |
|---|---|
| `UserPromptSubmit` | Current branch, uncommitted state, last 3 commits |
| `SessionStart` | Project standards summary (links), recent ADRs (last 5), open issues |
| `UserPromptSubmit` for ADR-related work | Inject the relevant standards doc + prior ADRs in the topic |

### Audit (log only)

| Lifecycle event | Action |
|---|---|
| `PostToolUse(Bash)` | Append to `.claude/audit.log` (timestamp, command, exit code) |
| `PreToolUse(Edit)` for files containing PII tags | Log access; require confirm to proceed |

### Configuration

Hooks live in `templates/_shared/claude/hooks/` and propagate to projects via the bootstrap script. The configuration is in `templates/_shared/claude/settings.json` with the schema documented inline.

## 4. Slash commands

Each command is a markdown file under `templates/_shared/claude/commands/` with frontmatter and a prompt template.

| Command | Purpose | Invokes | Model |
|---|---|---|---|
| `/brainstorm <topic>` | Open a structured brainstorming session for a feature, design choice, or problem | Head agent in architect mode | (head's session model) |
| `/adr <topic>` | Draft an ADR for a decision | Head agent in architect mode (or `architect` subagent if headless) | (head's session model) or Opus 4.6 |
| `/review` | On-demand review of the current diff or specified files | `code-reviewer` + `security-reviewer` (parallel) | Sonnet 4.6 (each) |
| `/security-review` | Focused security review | `security-reviewer` | Sonnet 4.6 |
| `/test <files>` | Generate or run tests for specific files | `test-writer` / `functional-tester` | Sonnet 4.6 / Haiku 4.5 |
| `/release-notes` | Draft narrative release notes for the pending release | `release-captain` (Sonnet tier) | Sonnet 4.6 |
| `/triage` | One-off triage scan over recent logs | `triage-bot` | Haiku 4.5 |
| `/digest` | Generate the daily/weekly digest on demand | Head agent in scrummaster mode | (head's session model) |
| `/scaffold-project --stack=<X> --name=<Y>` | Bootstrap a new project | Head agent + scaffolding scripts | (head's session model) |
| `/postmortem` | Draft a postmortem for a recent incident | `incident-responder` + `architect` | Sonnet 4.6 + Opus 4.6 |

## 5. Token & performance budgets

### Per-agent token budgets

| Agent | Per-invocation input | Per-invocation output | Trigger frequency (solo) | Monthly $ estimate |
|---|---|---|---|---|
| `code-reviewer` | ~30K | ~3K | ~20 PRs/mo | ~$2 |
| `security-reviewer` | ~30K | ~2K | ~20 PRs/mo | ~$2 |
| `architect` (headless) | ~50K | ~5K | ~3 ADR-gated PRs/mo | ~$3 |
| `test-writer` | ~20K | ~5K | ~15/mo | ~$2 |
| `functional-tester`, `e2e-tester` | ~10K | ~1K each | ~30/mo each | <$1 total |
| `doc-keeper` | ~15K | ~2K | ~10/mo | <$1 |
| `release-captain` | ~10K H / ~30K S | ~2K H / ~5K S | ~5 releases/mo | <$1 |
| `dep-watcher` | ~10K | ~1K | ~10/mo | <$1 |
| `incident-responder` | ~30K | ~3K | rare (target <2/mo) | <$1 |
| `drift-detector` | ~15K | ~2K | weekly | <$1 |
| `triage-bot` | ~10K | ~2K | daily | ~$1 |
| **Total estimate** | | | | **~$15/mo** |

These are estimates. Budgets are enforced per invocation by API limits and by each agent's prompt instructing it to abort if the budget is exceeded.

### Prompt caching

Applied to stable context that's the same across invocations:

| Cached content | Approx. size | Hit rate |
|---|---|---|
| Agent's system prompt | 2–5K | 100% |
| Platform CLAUDE.md + standards summary | ~10K | 100% |
| Project CLAUDE.md (≤200 lines) | ~3K | 100% per project |
| Recent ADRs (last 5) | ~15K | high |

Cached reads charged at ~10% of normal cost. This typically reduces the *effective* per-invocation input cost by 60–80%.

### Performance budgets per trigger

| Trigger | Budget | Mechanism |
|---|---|---|
| PR opened (full review battery) | ≤90s wall time | code-reviewer + security-reviewer + destructive-change-detector run **in parallel** |
| Merge to main (deploy + e2e) | ≤5 min | e2e-tester runs after dev deploy completes |
| Tag created (release flow) | ≤8 min | release-captain + Sentry release + publish in sequence |
| Agent response time (interactive) | <5s for Haiku; <30s for Sonnet; <2 min for Opus | Per Anthropic's published p95 latencies |
| Hook execution | <500ms per hook | Hooks are fast checks, not heavy work |

Budget violations follow ADR-0007's protocol: architect-led investigation, ADR-documented adjustment if justified.

## 6. Memory & context strategy

How agents access shared knowledge without re-reading everything:

| Layer | What's there | How agents access |
|---|---|---|
| **Platform repo's `CLAUDE.md` + standards docs** | The decisions ADR-0001 through ADR-0011 made | Loaded once into prompt cache; ~10K tokens; cached at 10% cost |
| **Project's `CLAUDE.md`** | Project-specific context (≤200 lines per ADR-0008) | Loaded into context per invocation; cached |
| **Memory files** (head agent only) | Cross-session knowledge about user, project history, working preferences | Read-only by subagents via head-agent injection; head agent updates |
| **Recent ADRs** | Last 5 accepted ADRs; cross-references when relevant | Injected into agent prompt by hooks (`SessionStart`, `UserPromptSubmit` for ADR work) |
| **The diff / changeset** | What this specific invocation is reviewing | Loaded fresh per invocation; not cached |
| **Audit log** (`.claude/audit.log`) | What agents have done historically | Read by `drift-detector` + `triage-bot` when investigating |

Subagents are stateless within an invocation. They do not write memory files. The head agent owns memory mutations.

## 7. Anomaly handling

Agents self-recover where possible. Escalation is for genuine anomalies, not safety.

| Anomaly | Agent action |
|---|---|
| Tool call fails (network, API rate limit) | Retry with exponential backoff, max 3 attempts. Escalate only if all 3 fail. |
| Output token budget exceeded | Save partial work; either request budget increase from head agent OR fall back to a narrower scope. |
| Test agent finds a destructive change in code being tested (an unsafe migration in a feature PR) | Stop the test run; route to `architect` (subagent) for ADR review; mark PR as ADR-gated. |
| Triage-bot finds an error pattern that requires immediate response (auth bypass observed in logs) | Skip ticket creation; page `incident-responder` directly. |
| Agent disagrees with the human's instruction | Push back **once** with reasoning; if human reaffirms, proceed. Don't endlessly debate. |
| Agent encounters something genuinely outside its training (novel cloud service, weird build system) | Escalate to head agent rather than guessing. |
| Hook blocks an action and agent has no fallback | Ask the human via the head agent; do not bypass the hook. |
| Agent invocation times out | Save partial state; report what was completed; let the orchestrator decide whether to retry. |

Each anomaly path is documented in the agent's system prompt as an explicit fallback. The agent's prompt template includes a final section: "Anomaly handling — if you encounter X, do Y."

## 8. Agent invocation patterns

### Parallel fan-out (preferred for independent work)

When multiple agents need to run on the same input and don't depend on each other, the head agent invokes them in parallel via a single message with multiple Agent tool calls:

```
PR opened →
  Head agent invokes (in one parallel batch):
    - code-reviewer
    - security-reviewer
    - destructive-change-detector
  → all three return → head agent aggregates → posts PR comment
```

### Sequential pipeline (when dependencies exist)

Some flows are inherently sequential:

```
release-please opens PR →
  release-captain (Tier 1, Haiku) reviews changelog →
    decides narrative is needed →
      release-captain (Tier 2, Sonnet) drafts narrative →
        release-captain auto-merges PR →
          deploy workflow runs → tag created →
            Sentry release CLI uploads source maps
```

### Triggered by hook (fastest path)

The fastest agent invocations are triggered by hooks rather than by explicit head-agent decisions:

```
PR opened →
  GitHub Actions workflow triggers →
    workflow invokes `code-reviewer` directly (no head-agent involvement) →
      result posted as PR comment
```

This pattern eliminates a head-agent round trip for fully-automated work.

## 9. Triggers — full table

| Trigger | Agents involved | Pattern |
|---|---|---|
| PR opened or updated | code-reviewer, security-reviewer, destructive-change-detector, test-writer (if coverage drops) | Parallel fan-out via GitHub Actions |
| ADR-gated PR (one of 5 categories per ADR-0003) | architect (subagent) drafts ADR; merge blocked until ADR Accepted | Sequential |
| Merge to main | doc-keeper updates docs; e2e-tester on dev | Parallel |
| release-please opens release PR | release-captain | Sequential (Tier 1 → Tier 2 if needed) |
| Tag created | release-captain (publish + Sentry release); deploy workflow | Sequential |
| Auto-rollback triggered | incident-responder | Direct |
| Auto-rollback fails | incident-responder pages human | Direct |
| Daily | triage-bot scans logs | Direct |
| Weekly | drift-detector checks IaC | Direct |
| Weekly | head agent in scrummaster mode generates digest | Scheduled head-agent session |
| Dependabot opens PR | dep-watcher | Direct |
| Hook fires (destructive bash detected, etc.) | Block + require human confirm | Hook-only, no agent |
| Slash command invoked | (per §4 table) | Direct |

## 10. Setup checklist

When bootstrapping a new project, the `new-project.sh` script will:

- [ ] Create `.claude/` directory by copying from `templates/_shared/claude/`
- [ ] Configure `.claude/settings.json` with hooks per §3
- [ ] Install all 12 agent definitions to `.claude/agents/`
- [ ] Install all 10 slash commands to `.claude/commands/`
- [ ] Add `.claude/audit.log` to `.gitignore`
- [ ] Configure GitHub Actions workflows that invoke agents on triggers (per §9)
- [ ] Generate project-specific `CLAUDE.md` (≤200 lines)
- [ ] Verify all agents can read the platform's standards docs (via the inheritance mechanism)

## 11. Execution contexts — Cowork vs CI

The platform's agents run in two distinct execution contexts. Each agent's frontmatter declares its `primary_context`; some agents have **enhanced capabilities when invoked from Cowork** because Cowork exposes MCP connectors that GitHub Actions runners do not.

### The two contexts

| Context | When | Has access to |
|---|---|---|
| **Cowork** | Interactive (you're at your desk talking to Claude) or scheduled-via-Cowork tasks | Memory across sessions; MCP connectors (Slack, Linear/Jira/Atlassian, Notion, GitHub, calendar, email, etc.); desktop notification capability; full file/bash access to your workspace |
| **CI** | GitHub Actions invokes the agent via `anthropics/claude-code-action@v1` on a trigger (PR, push, tag, schedule) | The repo content; AWS via OIDC; secrets configured in the GitHub environment; GitHub Issues / PR APIs; whatever's wired in the workflow YAML |

### Capability matrix per agent

| Agent | Primary context | Cowork enhancements |
|---|---|---|
| `architect` (headless) | CI | In Cowork: head agent in architect mode handles interactive design; the headless `architect` only fires on ADR-gated PRs |
| `code-reviewer` | CI | None significant; CI is the right place for PR review |
| `security-reviewer` | CI | None significant; CI is the right place for PR review |
| `test-writer` | Either | Cowork: can use connectors (e.g., read Linear ticket for context). CI: just the diff. |
| `functional-tester` | Either | Cowork: can post test reports to Slack via connector. CI: PR comment only. |
| `e2e-tester` | Either | Same as functional-tester |
| `doc-keeper` | CI | None significant |
| `release-captain` | CI | Cowork: can post release announcements to Slack/Notion via connectors. CI: GitHub Release page only. |
| `dep-watcher` | CI | None significant |
| `incident-responder` | CI **+ Cowork-enhanced for paging** | **Cowork: can reach the human via desktop notification + Slack DM + email via connectors** (the actual paging). CI: can only open issues + send via configured webhooks (PagerDuty, Slack-via-webhook). |
| `drift-detector` | CI | Cowork: can cross-post drift summaries to Linear/Notion |
| `triage-bot` | CI **+ Cowork-enhanced for cross-tracker dispatch** | **Cowork: can post high-impact tickets to Linear/Jira/Slack via connectors; can email user-feedback submitters via SES (if SES not wired in CI).** CI: GitHub Issues only. |

### The handoff pattern

Some workflows want capabilities that span contexts. The platform pattern:

1. **CI does the structured work.** Always. Every event creates a GitHub Issue, PR comment, or commit — something durable in the repo.
2. **Cowork does the connector fan-out.** When you open a Cowork session (interactive or scheduled), the head agent in scrummaster mode reads the GitHub state and reconciles to connector-only destinations.

Concrete examples:

- **User feedback** (per Standard 11): the `/api/feedback` backend creates GitHub Issues with `feedback:user-submitted`. CI-context `triage-bot` daily-scans these and applies classification labels. **Next Cowork session**: head agent reviews high-impact items and forwards summaries to Slack/Linear/email.
- **Drift detection**: CI-context `drift-detector` runs weekly and creates a GitHub Issue per drift. **Next Cowork session**: head agent reviews the digest and notifies on Slack if anything is structurally significant.
- **Release announcement**: CI-context `release-captain` creates the GitHub Release. **Next Cowork session**: head agent in release-announcer mode posts to Slack/Notion with the narrative summary.

### Scheduled tasks — where they run

| Schedule | Run via | Why |
|---|---|---|
| Daily/weekly **digest generation** (head agent in scrummaster mode) | **Cowork scheduled task** (preferred) — falls back to CI cron with reduced capability | Digest pulls from Slack/Linear/Notion via connectors; CI version can only pull from GitHub. |
| Daily **`triage-bot` log scan** | **CI cron** | Log sources (CloudWatch, Sentry) work the same in both; CI is fine. |
| Weekly **`drift-detector` IaC plan** | **CI cron** | AWS access + tofu binary; CI is the right place. |
| **Sentry release entry** post-deploy | **CI** (in the release workflow) | Tied to the deploy event; runs in the deploy workflow. |
| **Dep CVE scan** | **CI cron + Dependabot** | GitHub-native. |

The pattern: **CI handles the work that's tied to repo state or runs on a strict cadence the human can't be guaranteed to be at.** Cowork handles the work that benefits from connectors AND tolerates "next time the human is at their desk" cadence.

### What this means for agent frontmatter

Each agent's `primary_context` is declared in frontmatter. The agent's system prompt's "Inputs" section enumerates what's available in each context, and the "Process" section's anomaly-handling notes when a needed connector is unavailable in the current context (typically: degrade gracefully — produce GitHub-issue output even when Slack/Linear connectors are missing, and let the next Cowork session reconcile).

## 12. Anti-patterns to avoid

- ❌ **Default-Sonnet-everywhere.** Wasteful. Tier the agents by reasoning depth required.
- ❌ **Skipping prompt caching for the system prompt.** 80% cost difference; trivial to enable.
- ❌ **Subagents calling subagents directly.** They're peer specialists; the head agent dispatches. (Tier 2 escalation within a single agent is fine because it's the same agent's prompt routing.)
- ❌ **Sequential when parallel works.** PR review battery should always fan out.
- ❌ **Adding human-confirmation steps "to be safe."** Per ADR-0003, that pattern rots. Use hooks for genuine danger; agents have authority for their scope.
- ❌ **Hook scripts that run for >500ms.** Hooks are fast checks; if you need real work, dispatch an agent.
- ❌ **Memory writes from subagents.** Head agent owns memory; subagents are stateless.
- ❌ **`workflow_dispatch` (manual triggers) for routine work.** That's the emergency-deploy escape hatch only. If you find yourself triggering manually often, automate it instead.
- ❌ **Agents doing work that hooks could prevent.** A `PreToolUse(Bash)` hook blocking destructive commands is cheaper and more reliable than asking the agent to "be careful."
- ❌ **Custom system prompts written from scratch per project.** The platform's agent definitions are the source of truth; project-specific tuning is per-project frontmatter, not from-scratch prompts.
