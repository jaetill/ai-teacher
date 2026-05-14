# ADR-0011: AI Workflows — Architecture, Models, Hooks, Commands

- **Status:** Accepted
- **Date:** 2026-05-08
- **Deciders:** Jason
- **Tags:** ai-workflows, subagents, hooks, slash-commands, models, tokens, performance

> Format: MADR 4.x (bundled sub-decisions form). See `template.md`.

## Context and Problem Statement

Every prior ADR (0001 through 0010) assumed that AI agents would do the operational labor and that the human would intervene only at architectural decisions. This ADR is where those assumptions become real configuration: which models run when, which agents do what, what hooks enforce, what slash commands exist, and how the whole system stays within sane token and time budgets.

The question: how do we operationalize "AI shipping authority + human only at ADR-gated decisions" as concrete agent definitions, hook scripts, and command files — without the system becoming so expensive (in tokens or wall time) that it stops feeling autonomous?

This ADR bundles six sub-decisions because models, budgets, hooks, slash commands, memory strategy, and anomaly handling are all interdependent. Choosing Opus for every agent makes the cost prohibitive; using Haiku for the architect makes its outputs unusable; treating all hooks as "block" makes the system hostile; treating all of them as "log only" makes them useless.

## Decision Drivers

- **Token cost discipline** (user explicitly emphasized at proposal time). Cheap models for routine work; expensive models only where reasoning depth justifies. Prompt caching everywhere it applies.
- **Performance discipline** (per ADR-0007). Agents must not slow CI noticeably. Parallel fan-out where possible; per-trigger budgets enforced.
- **AI-autonomy default** (per ADR-0003 as refined). Each agent has explicit authority for its scope. Self-recovery preferred over escalation. No "review steps to be safe."
- **Two-entity architecture** (decided in earlier conversations during this build). Head agent + 12 specialist subagents; orchestration lives in the head agent.
- **The 12 subagents have already been chosen** through the build of standards 1–9. This ADR doesn't introduce them; it operationalizes them.
- **The standards 1–9 already imply specific agent triggers.** This ADR consolidates those trigger expectations into a single trigger table.
- **Solo developer.** Setup must be one bootstrap script run; ongoing tuning must be ADR-gated, not ad-hoc.

## Considered Options

The bundle has six sub-decisions:

- **Sub-decision 1 — Model selection per agent:** chose **Tiered (Haiku/Sonnet/Opus by reasoning depth)** with cheap-then-escalate pattern for several agents
- **Sub-decision 2 — Token budgets:** chose **Per-agent caps + prompt caching of stable context + ~$15/mo total target at solo scale**
- **Sub-decision 3 — Hook policy concretization:** chose **Mixed strictness with a concrete rule set** (block destructive bash + secrets exposure; warn on lint/tests/format/types; inject branch state on prompt; audit bash)
- **Sub-decision 4 — Slash command set:** chose **10 commands** covering the day-to-day on-demand needs
- **Sub-decision 5 — Memory & context strategy:** chose **Tiered cache** (platform standards cached; project CLAUDE.md cached; memory head-agent-only; diffs fresh-per-invocation)
- **Sub-decision 6 — Anomaly handling:** chose **Self-recover with retry/fallback; escalate only on genuine novelty or repeated failure**

## Decision Outcome

We adopt:

1. **Two-entity architecture.** Head agent (orchestrator + decision partner, multi-mode) + 12 specialist subagents (headless workers).
2. **Tiered model selection.** Haiku 4.5 for routine work (doc-keeper, dep-watcher, *-tester, drift-detector classification, triage-bot scanning, release-captain Tier 1). Sonnet 4.6 for reasoning work (code-reviewer, security-reviewer, test-writer, incident-responder, plus Tier 2 of the cheap-then-escalate agents). Opus 4.6 only for `architect` (headless) on ADR-gated PRs.
3. **Cheap-then-escalate pattern** for release-captain, drift-detector, triage-bot, dep-watcher, *-tester. Tier 1 (Haiku) classifies and completes routine work; Tier 2 (Sonnet) is invoked when reasoning depth is needed. Same agent definition; routing in the prompt.
4. **Per-agent token budgets** documented in the standards doc; enforced per invocation; total target ~$15/mo at solo scale.
5. **Prompt caching** applied to all stable context (agent system prompts, platform standards summary, project CLAUDE.md, recent ADRs). Cached reads at ~10% cost; effective per-invocation cost reduced 60–80%.
6. **Hook policy with concrete rules** in §3 of the standards doc — blocks destructive bash + secrets exposure + writes to forbidden paths; warns on lint/tests/format/types; injects context on session start and prompt submit; audits all bash.
7. **Ten slash commands** covering brainstorming, ADR drafting, on-demand review, test generation, release notes, triage, digest, project scaffolding, postmortems.
8. **Memory & context strategy:** subagents are stateless; head agent owns memory; recent ADRs and standards are injected via hooks; diffs are loaded fresh per invocation.
9. **Anomaly handling:** retry with backoff; pushback once with reasoning; escalate only on genuine novelty or repeated failure. Each agent's system prompt explicitly documents fallbacks.
10. **Performance budgets per trigger:** PR review battery ≤90s (parallel fan-out); merge-to-main ≤5 min; tag-to-release ≤8 min; hooks <500ms each.

## Consequences

### Positive

- **Operational reality.** The 10 prior ADRs become a working system, not a paper architecture.
- **Cost discipline.** ~$15/mo at solo scale is predictable and well within the value provided.
- **Performance honest with users.** Per-trigger budgets prevent the AI side from becoming a tax on velocity.
- **Self-recovery posture.** Most failures don't reach the human; only genuine anomalies escalate.
- **Cheap-then-escalate pattern** reduces costs on routine work without sacrificing quality on the cases that need reasoning depth.
- **Hook policy concretization** makes "Mixed strictness" a real configuration rather than aspirational.
- **Slash command set** gives the human cheap-to-invoke entry points for the day-to-day on-demand needs.
- **Memory strategy keeps subagents simple** — they don't need to manage state, which keeps their prompts narrow and reduces variability.

### Negative

- **Tier 2 escalation logic adds complexity** to several agents. The agent's prompt needs to handle the routing. Mitigated by: each escalation rule is explicit; the prompt template documents it.
- **Parallel fan-out requires coordinated tool calls.** The head agent must group invocations into single multi-tool messages. Mitigated by: the head agent's prompt explicitly directs parallel-when-independent.
- **Hook configuration is per-project (in `.claude/settings.json`).** Updates to hook policy require touching every project. Mitigated by: the canonical config lives in `templates/_shared/claude/` and propagates via the bootstrap script; updates flow through normal Git operations.
- **Token budget targets are estimates.** Real usage may diverge — calibration period (per ADR-0003) catches this; per-agent telemetry feeds into the digest so we see drift.
- **Cheap-then-escalate logic** means some agents have two model contracts to manage. If the Tier 2 path runs more than expected, costs rise. Mitigated by: digest tracks Tier 2 invocation counts; threshold violations trigger an architect-led investigation.

### Neutral

- We're committed to Anthropic's model lineup. A future migration to other providers would mean updating model identifiers in agent definitions; the architecture is provider-agnostic.
- The 10 slash commands list is the initial set. Adding new commands is cheap; removing them rare. Expect the set to grow as patterns emerge.
- The hook policy may need tuning per project as edge cases surface. The architect (head agent in architect mode) drafts ADRs to revise the policy; updates propagate via the platform repo.

## Pros and Cons of the Options

### Sub-decision 1: Model selection per agent

| Option | Trade-off |
|---|---|
| **All-Sonnet (one tier)** | Simpler; ~3× cost vs tiered for routine work; some agents over-resourced. |
| **All-Opus** | Maximum reasoning depth everywhere; ~10× cost; absurd at solo scale. |
| **Tiered (Haiku/Sonnet/Opus per agent) with cheap-then-escalate** (chosen) | Cost discipline; matches reasoning depth to task; some prompt-template complexity for the escalating agents. |
| **All-Haiku** | Cheapest; insufficient reasoning for code review and ADR drafting. |

### Sub-decision 2: Token budgets

| Option | Trade-off |
|---|---|
| **No explicit budgets** | Simplest; costs surprise you. |
| **Per-agent caps + prompt caching** (chosen) | Predictable; surfaces drift via the digest; some upfront calibration. |
| **Hard global cap (e.g., $10/mo)** | Fixed cost; agent invocations may be denied mid-month if hit. |

### Sub-decision 3: Hook policy concretization

| Option | Trade-off |
|---|---|
| **All-block (any potential issue stops the agent)** | Maximum safety; hostile in practice; agents constantly need confirmation. |
| **All-warn (surface but never block)** | Minimal friction; loses real safety on destructive bash + secrets. |
| **All-audit (log everything but no enforcement)** | Maximum visibility; no protection. |
| **Mixed with concrete rules** (chosen) | Block destructive bash + secrets + protected paths; warn on quality issues; inject context where useful; audit bash universally. |

### Sub-decision 4: Slash command set

| Option | Trade-off |
|---|---|
| **Minimal set (just `/review` and `/adr`)** | Lower maintenance; misses common on-demand needs. |
| **Ten-command set** (chosen) | Covers brainstorming, ADRs, review, security review, test, release notes, triage, digest, scaffold, postmortem; matches actual workflow patterns. |
| **Twenty-plus commands** | Maximum flexibility; UX problem (which command do I use?); maintenance overhead. |

### Sub-decision 5: Memory & context strategy

| Option | Trade-off |
|---|---|
| **Each agent reads everything fresh per invocation** | Simplest; expensive (no cache benefits); slow. |
| **Tiered cache: stable context cached; diffs fresh** (chosen) | Cost-effective; matches Anthropic's caching model; subagents stateless. |
| **Subagents have their own persistent memory** | Maximum context; complex coordination; conflicts; subagent state is hard to debug. |

### Sub-decision 6: Anomaly handling

| Option | Trade-off |
|---|---|
| **Escalate any anomaly to head agent** | Simplest; head agent gets noisy. |
| **Self-recover with retry; escalate only on genuine novelty** (chosen) | Matches AI-autonomy principle; head agent only sees real problems. |
| **Agents debate and never escalate** | Maximally autonomous; can spin in disagreement loops. |

## Implementation notes

- Standards doc: [`docs/standards/10-ai-workflows.md`](../standards/10-ai-workflows.md).
- The 12 agent definition files live in `templates/_shared/claude/agents/<name>.md`. Each agent's frontmatter declares: `name`, `model`, `tools` (allowlist), and any `escalates_to` for cheap-then-escalate agents. Authored as part of this ADR's implementation; written in batches following this ADR.
- Hook configuration: `templates/_shared/claude/settings.json` with the schema documented in §3.
- Slash commands: `templates/_shared/claude/commands/<name>.md` per §4.
- Bootstrap script `scripts/new-project.sh` propagates all of the above into each scaffolded project's `.claude/`.
- The `.claude/audit.log` file is gitignored per project; retention follows local disk hygiene (no automatic purge for now; revisit if it grows).
- Telemetry: per-agent invocation counts and token usage are logged to the audit log; weekly digest aggregates them into a "AI activity" section.

## Links

- ADR-0001 (Platform foundations) — the two-layer platform structure.
- ADR-0003 (CI/CD) — AI shipping authority + 5 ADR-gated change categories; trigger source for `architect`, `code-reviewer`, `security-reviewer`, `destructive-change-detector`.
- ADR-0004 (Testing) — test agent triggers (test-writer, functional-tester, e2e-tester); tiered coverage drives test-writer's invocation rule.
- ADR-0005 (Quality gates) — comment policy + code-quality-enforcement gap operationalized in code-reviewer's prompt.
- ADR-0006 (Secrets) — PII tag check operationalized in security-reviewer's prompt.
- ADR-0007 (IaC) — drift-detector triggers + performance budget discipline applied here.
- ADR-0008 (Documentation) — doc-keeper triggers; ADR drafting via `architect`.
- ADR-0009 (Observability) — triage-bot's log ingestion source; incident-responder's alert source.
- ADR-0010 (Release management) — release-captain's authority and triggers.
- [Anthropic prompt caching](https://docs.anthropic.com/claude/docs/prompt-caching) — the mechanism this ADR's caching strategy depends on.
- [Anthropic model pricing](https://docs.anthropic.com/claude/docs/models-overview) — basis for the cost estimates.
- [MADR 4.x](https://adr.github.io/madr/) — ADR format used.
