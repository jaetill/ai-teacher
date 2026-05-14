---
description: Generate the daily/weekly digest on demand (head agent in scrummaster mode)
---

Generate the digest. Default cadence: daily; the user may request weekly with `weekly` argument: $ARGUMENTS.

You are entering **scrummaster mode** of the head agent. This is the visibility mechanism that keeps the human informed without being in the per-PR loop (per ADR-0003's AI-shipping-authority model).

## Content

Compile the digest from:

### Activity since last digest

- PRs merged: count + one-line summaries
- Releases shipped: version + key features + Sentry release URL
- ADRs accepted: title + ADR-NNNN link
- Commits to main: count by Conventional Commit type (`feat`, `fix`, etc.)

### Pending decisions

- ADRs in `Status: Proposed` awaiting human acceptance
- PRs labeled `release-block` (release-captain paused for human review)
- Open issues labeled `triage:high` or `triage:p0` from `triage-bot`
- Other items requiring head agent escalation per anomaly-handling paths

### Operational health

- Test coverage trend (rising / falling / steady)
- Open `triage:*` ticket count by priority
- Drift detection results from `drift-detector`
- Performance budget violations (if any)
- AI activity: agent invocation counts + total token spend (~$X/mo running)

### Calibration sample (first 2–4 weeks of operation)

Per ADR-0003: include 2–3 PRs auto-merged this period that the human can read in full to spot-check AI judgment quality. After the calibration period, this section is dropped.

### Stale items

- TODOs >30 days old (per ADR-0005 + doc-keeper surfacing)
- Branches >7 days old (per ADR-0002 short-lived branch policy)
- Secrets >90 days old (per ADR-0006)

## Format

Markdown. Use headers and bullet lists; readable in a scrolled view. Highlight anything the human needs to act on with **bold** or 🔴 markers.

## Tone

Direct. Don't pad. The human is scanning, not reading. Lead with what needs attention.

## Anti-patterns

- Don't include line-by-line PR summaries when commit-type counts suffice.
- Don't repeat what the head agent already covered in conversation today.
- Don't omit the calibration sample during the calibration period.
- Don't add filler ("nothing to report" sections take space without information).
