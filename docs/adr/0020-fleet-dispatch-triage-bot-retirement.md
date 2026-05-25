# ADR-0020: Fleet-Dispatch Pattern + Retire Standalone Triage-Bot Workflow

- **Status:** Accepted
- **Date:** 2026-05-25
- **Deciders:** Jason
- **Tags:** ai-workflows, triage-bot, fleet-dispatch, ci-cd, implementer

> Format: MADR 4.x (single-decision form). See [`template.md`](template.md).

## Context and Problem Statement

The standalone `claude-triage-bot.yml` workflow fires on every issue-opened event, adding classification labels and a triage comment. It was adopted in ADR-0011 as the issue-intake layer for the implementer pipeline. However, it has a structural constraint: it explicitly does NOT add the `ready-for-implementer` label — that gate belongs to the human. The workflow therefore runs on every new issue regardless of whether that issue will ever be dispatched to the implementer.

A companion platform change (`jaetill/agentic-dev-environment#33`) introduced fleet-dispatch — targeted `workflow_dispatch`-based implementer activation with a `mode` input — and retired the standalone triage workflow in the same sweep. ADR-0011 and ADR-0012 both reference `triage-bot` as a live platform component; without this ADR those documents are inconsistent with the operational reality post-merge.

The question: should `claude-triage-bot.yml` remain as the intake layer, or should triage classification move inline to the implementer at dispatch time, with fleet-dispatch as the primary activation path?

## Decision Drivers

- **Token cost discipline.** A separate workflow run per issue-open event is overhead; most new issues never reach the implementer. Inline triage at dispatch time is zero-cost until work is actually requested.
- **Dispatch simplicity.** Fleet-dispatch (`workflow_dispatch` with an `issue_number` input) plus the `ready-for-implementer` label already carry enough context; a pre-dispatch triage comment adds latency and noise for issues that will never be acted on.
- **Bot-guard requirement.** Per ADR-0013, the `ready-for-implementer` trigger must only respond to human actors. A separate triage-bot adding intermediate labels increases the risk of accidental double-dispatch through automation.
- **ADR consistency.** Retiring the workflow without documenting the decision leaves ADR-0011 and ADR-0012 referencing a no-longer-live component — the gap that created issue #58.
- **Customer-advocate lens preservation.** ADR-0012 §5 committed to the triage-bot's customer-advocate classification of `feedback:*` issues; that lens must be preserved regardless of which component does the classification.

## Considered Options

- **Option A: Keep standalone triage-bot** — Retain `claude-triage-bot.yml`; add bot-guard awareness so its labels don't accidentally trigger the implementer.
- **Option B: Retire standalone triage-bot; triage inline** — Remove the per-issue-open workflow; classify inline during the implementer's Mode A process; use fleet-dispatch (`workflow_dispatch`) as the primary activation path.
- **Option C: Replace with a lighter issue-labeler** — Keep a workflow but replace the full triage-bot agent with a rules-based labeler (no LLM call, just regex-based label application).

## Decision Outcome

Chosen option: **Option B — Retire standalone triage-bot; triage inline.**

The decisive factor: the bot-guard constraint makes pre-dispatch triage labels moot for the activation path. Inline classification at dispatch time preserves the customer-advocate lens at zero extra cost (it is part of the implementer's Mode A read-the-issue step) while eliminating a per-issue workflow run on every new issue.

## Consequences

### Positive

- **Reduced token spend.** No triage agent runs on issues that never reach the implementer.
- **Simpler pipeline.** One fewer workflow that must be kept consistent with the implementer's guard logic.
- **Bot-guard is clean.** No intermediate bot labels exist that could accidentally trigger the implementer; only human-added `ready-for-implementer` labels and direct `workflow_dispatch` activations reach the implementer.
- **Customer-advocate lens preserved.** The implementer's Mode A includes an inline classification step using the same lens as the retired triage-bot; feedback issues receive the same quality of triage at dispatch time.

### Negative

- **No automatic triage comment on new issues.** Issues that arrive but are never dispatched receive no AI-generated classification comment. Humans must scan the unlabeled queue without a bot-provided summary.
- **ADR-0012 §5 promise partially weakened.** The original promise was that `feedback:*` issues would get an automatic customer-advocate triage pass on arrival. Triage now only occurs at dispatch time, meaning there is a window where feedback issues sit unlabeled.

### Neutral

- **Fleet-dispatch activation path is additive.** The implementer workflow's `workflow_dispatch` inputs (`issue_number`, `mode`) add new paths; no existing label-triggered path that was working for humans is removed.
- **`triage-bot` agent definition retained.** `.claude/agents/triage-bot.md` is NOT deleted. The agent spec remains available for on-demand invocation via `/triage` or future re-automation; only the standing automation workflow is retired.

## Pros and Cons of the Options

### Option A: Keep standalone triage-bot

- ✅ Pro: Existing promise in ADR-0012 §5 is fully honored (auto-classification on issue open).
- ✅ Pro: Issues arrive pre-labeled for human review regardless of dispatch intent.
- ❌ Con: Every new issue triggers a Claude API call, regardless of whether it ever reaches the implementer.
- ❌ Con: Making triage-bot's output bot-guard-safe (labels that don't look like dispatch triggers) adds coordination complexity between two workflows.

### Option B: Retire standalone triage-bot; triage inline (chosen)

- ✅ Pro: Zero token cost until work is actually requested.
- ✅ Pro: Bot-guard stays simple — only human actions reach the implementer.
- ✅ Pro: Removes per-issue workflow overhead.
- ❌ Con: New issues sit unlabeled until dispatched; human must scan unlabeled queue.
- ❌ Con: ADR-0012 §5 commitment requires updating.

### Option C: Replace with lighter issue-labeler

- ✅ Pro: Continues per-issue labeling without LLM cost.
- ❌ Con: Rules-based labeling is brittle on ambiguous issues.
- ❌ Con: Still fires per-issue-open; still requires maintenance.
- ❌ Con: Does not solve the bot-guard complication.

## Implementation notes

- **Workflow deleted:** `.github/workflows/claude-triage-bot.yml` — removed in the PR that introduced fleet-dispatch support (PR #53, companion to platform PR `jaetill/agentic-dev-environment#33`).
- **Workflow updated:** `.github/workflows/claude-implementer.yml` — the `initial` job's `ready-for-implementer` trigger adds `github.event.sender.type != 'Bot'`; a new `cleanup-sweep` Mode C job is added for batch deferred-nit processing.
- **ADR-0012 §5:** Sub-decision 5 (triage flow) updated to reflect that inline triage replaces the standalone workflow. See [ADR-0012](0012-user-feedback.md).
- **ADR-0011 reference:** ADR-0011 §2 lists `triage-bot` as one of the 12 subagents and references it in the cheap-then-escalate pattern. The agent definition is retained; only the standing automation is retired.
- **Re-automation path:** If the volume of incoming issues justifies restoring automated triage, the preferred path is a new ADR that extends this one and re-introduces a workflow with an explicit bot-guard (no dispatch-triggering labels; comment-only output).

## Links

- [ADR-0011](0011-ai-workflows.md) — originally defines `triage-bot`'s role and cheap-then-escalate pattern; `triage-bot` remains a named agent but the standing workflow is retired.
- [ADR-0012](0012-user-feedback.md) — §5 (triage flow sub-decision) updated to reflect inline triage at dispatch time.
- [ADR-0013](0013-grafana-cloudwatch-pull.md) — trust tiers; the bot-guard on `ready-for-implementer` enforces the Tier-3 → human-dispatch requirement.
