---
description: Draft a postmortem for a recent incident
---

Draft a postmortem for: $ARGUMENTS.

## Routing

Invoke `incident-responder` (Sonnet) for the postmortem draft. If the postmortem identifies a class of architectural problem, additionally invoke `architect` (Opus) to draft a paired ADR proposing prevention.

## Process

The `incident-responder` follows its system prompt's postmortem template:

1. **Timeline.** Specific timestamps for: alert fired, action taken, mitigation, resolution.

2. **Root cause.** Real cause, not symptom. "Latency was high" isn't a cause; "deploy v1.4.3 introduced a race condition in auth middleware" is.

3. **Mitigation steps.** What worked. What didn't. Why.

4. **Prevention.** What would prevent this class of incident? If the answer is architectural ("add backoff to rollback workflow"; "pin dependency versions"; "add test coverage for X"), file an ADR proposal via `architect`.

## Tone

**Blameless.** Per Google SRE practice and platform discipline: postmortems identify systemic gaps, not human error. Even if a human made a mistake, the question is "why did our system make that mistake possible?" — not "who do we hold responsible?"

## Output

Markdown file in `docs/postmortems/<date>-<incident-name>.md` (or as a runbook if recurrent). Plus a summary in the head agent's response.

If a paired ADR is recommended, the architect drafts it and the user reviews both together (postmortem + prevention ADR).

## Anti-patterns

- ❌ **Vague root causes.** "Things were slow" isn't a cause.
- ❌ **Blaming individuals.** Identify systemic gaps.
- ❌ **No prevention.** A postmortem without a "what we'd do differently" is incomplete.
- ❌ **Skipping the timeline.** The chronological reconstruction is what makes the story comprehensible.
