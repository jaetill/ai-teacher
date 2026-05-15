---
description: Focused security review (security-reviewer agent, standalone)
---

Run a security review on: $ARGUMENTS (default: the current PR diff or the staged changes).

Invoke `security-reviewer` (Sonnet) standalone. This is the focused-security version of `/review`; use when the user wants only the security lens, not the general code-quality lens.

## Process

The `security-reviewer` agent reviews per its system prompt. The user receives findings grouped by severity:

- **Critical** (blocking): exploitable vulnerability; secret committed; auth bypass
- **High** (blocking): missing auth check; weak crypto; PII in logs
- **Medium** (strong suggestion): missing rate limit; overly broad IAM; non-cryptographic randomness in security context
- **Low** (suggestion): defense-in-depth improvements

For ADR-gated security-relevant changes, the `architect` agent should additionally be invoked to draft a paired ADR.
