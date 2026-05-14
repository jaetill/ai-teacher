---
description: One-off triage scan over recent logs and errors
---

Run a one-off triage scan: $ARGUMENTS (default: last 24h, current project).

## Process

Invoke `triage-bot` (Tier 1 — Haiku) for the scan + classification step. It:

1. Pulls recent ERROR-level log lines from CloudWatch Logs Insights
2. Pulls recent Sentry issues (grouped)
3. Pulls anomalous metrics from Grafana dashboards
4. Groups similar events
5. Classifies each by technical severity (P0–P3 per ADR-0009 §6) AND user impact (silent-loss / visible-failure / degraded / internal-only)
6. Dedupes against existing open `triage:*` labeled issues
7. Escalates new patterns to Tier 2 (Sonnet) for ticket framing

## Output

A triage summary report including:

- Total errors / events scanned
- New patterns identified (will become tickets)
- Existing tickets updated (counts incremented)
- Active incidents detected (if any — those route to `incident-responder`, not into the triage queue)
- Top patterns by severity × user impact

Tickets filed by Tier 2 will appear with structured framing — user-impact lens first, technical detail second.

## Anti-patterns to avoid

- Don't expect this command to fix issues; it surfaces them.
- Don't use it for active incidents (use the incident-response runbook + `incident-responder` directly instead).
- Don't run it more than once per few hours — daily scans cover normal cadence.
