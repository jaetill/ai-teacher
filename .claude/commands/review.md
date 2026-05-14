---
description: On-demand code review of the current diff or specified files (parallel code-reviewer + security-reviewer)
---

Run a code review on: $ARGUMENTS (default: the current PR diff or the staged changes).

## Process

Invoke `code-reviewer` and `security-reviewer` **in parallel** via a single message with multiple Agent tool calls. They have non-overlapping scopes and run cheaper concurrently.

`code-reviewer` reviews for:
- Misleading or vague names (per ADR-0005's code-quality enforcement gap)
- Functions doing more than one thing
- Premature abstraction or premature optimization
- Inconsistent abstractions across sibling code
- Cleverness that obscures intent
- Comments explaining *what* instead of *why*
- TODOs without owner/date
- Inconsistent error handling
- Missing tests on changed code (per ADR-0004 tier thresholds)

`security-reviewer` reviews for:
- Injection vectors (SQL, shell, template, OS command, LLM prompt injection)
- Secrets handling (per ADR-0006)
- PII redaction in logs (per ADR-0006)
- Authentication / authorization
- Cryptographic practices
- Dependency posture
- Permission / IAM
- Cross-site / web-specific vulnerabilities
- Logging & monitoring posture

## Output

Aggregate findings from both agents into a single report grouped by severity:

- **Blocking**: must address before merge
- **Strong suggestion**: should address in this PR
- **Suggestion**: improvement worth considering
- **Note**: minor observation

Cite file:line for every finding.
