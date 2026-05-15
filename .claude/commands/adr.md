---
description: Draft an ADR for a decision in MADR 4.x format with the platform's three documented extensions
---

The user wants to draft an ADR for: $ARGUMENTS.

If the user is in conversation with you (interactive use), proceed in **architect mode** of the head agent. If invoked headlessly (autonomous workflow), invoke the `architect` subagent (Opus model) with this same prompt.

## Process

1. **Read the ADR template** at `docs/adr/template.md`. Follow MADR 4.x format with the three documented extensions: Neutral consequences, Implementation notes, Bundled sub-decisions (when applicable).

2. **Determine the next ADR number.** Find the highest existing `docs/adr/NNNN-*.md` and use N+1. ADR numbering is by creation order, not by topic.

3. **Build the ADR body:**
   - **Context and Problem Statement**: 2–3 sentences naming the problem; the question being answered.
   - **Decision Drivers**: forces / constraints any acceptable answer must respect.
   - **Considered Options**: list the options (just names; details go in Pros and Cons section after the Decision Outcome).
   - **Decision Outcome**: which option, with the decisive factor.
   - **Consequences**: Positive, Negative, **Neutral** (the third bucket is required even if empty as a forcing function).
   - **Pros and Cons of the Options**: detailed evaluation per option (or per sub-decision in bundled form).
   - **Implementation notes**: pointers to standards docs, code, configs.
   - **Links**: authoritative sources, prior ADRs, MADR 4.x reference.

4. **Author the ADR file** at `docs/adr/NNNN-name.md` with `Status: Proposed`. The user will review and accept (or revise) — that's the human's discernment role.

5. **Update the standards index** if the ADR corresponds to a standard (`docs/standards/index.md`).

6. **Report**: brief summary of the decision and the file path. The user reads the ADR file, not your summary.

## Tone

The ADR is a portfolio artifact. Write it for a reader 6 months in the future who doesn't remember the context. Be specific about *why* the decision was made, not just *what* was decided. Cite sources.
