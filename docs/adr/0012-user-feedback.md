# ADR-0012: User Feedback — Two-Tier Widget + GitHub Issues + triage-bot

- **Status:** Accepted
- **Date:** 2026-05-09
- **Deciders:** Jason
- **Tags:** user-feedback, sentry, github-issues, triage-bot, ses

> Format: MADR 4.x (bundled sub-decisions form). See `template.md`.

## Context and Problem Statement

Projects built on this platform are user-facing. Users will encounter bugs and want to suggest features. Without an explicit channel, that signal is lost — emails go unread, support requests come through ad-hoc, and the work queue stays dev-team-only rather than user-informed.

The platform already has the relevant infrastructure: Sentry (per ADR-0009), GitHub Issues (per ADR-0002 conventions), and the `triage-bot` agent (per ADR-0011) which classifies signals with a customer-advocate lens. What's missing is the explicit user-facing surface and the wiring from there to the work queue.

The question: which feedback-collection mechanism, storage backend, triage flow, and reply pattern compose with the existing architecture without adding vendor lock-in or significant infrastructure?

This ADR bundles five sub-decisions because widget pattern, storage, triage, reply policy, and rate limiting are interdependent.

## Decision Drivers

- **Solo developer cost discipline.** New vendor accounts are a real cost; reuse what we already have (Sentry, GitHub, AWS SES, triage-bot).
- **AI labor pool.** The `triage-bot` agent already does classification + dedup with a customer-advocate lens. User feedback is a natural new input source for it; not adding it would mean re-implementing triage logic elsewhere.
- **Privacy.** Live data exists (Game Night). PII discipline from ADR-0006 must extend to feedback (especially screenshots).
- **Spam resistance.** Public-facing endpoints are spam targets; rate limiting is non-optional.
- **Portfolio signal.** A polished feedback flow is a real portfolio signal; the absence of one looks unfinished.
- **Two distinct contexts.** "User hit an error" and "user wants feature X" need different UX; one widget can't serve both well.

## Considered Options

The bundle has five sub-decisions:

- **Sub-decision 1 — Widget pattern:** chose **Two-tier (Sentry User Feedback + custom form)**
- **Sub-decision 2 — Storage:** chose **GitHub Issues with structured labels** (no intermediate DB)
- **Sub-decision 3 — Auto-reply policy:** chose **Submit-confirmation + close-status-update; opt-in via email field**
- **Sub-decision 4 — Rate limiting / abuse:** chose **Per-IP rate limit + honeypot + optional Turnstile**
- **Sub-decision 5 — Triage flow:** chose **`triage-bot` ingests `feedback:*` labeled issues as a third input source**

## Decision Outcome

We adopt:

1. **Two-tier widget pattern.** Sentry User Feedback widget for error-attached reports (zero infra; pops up on captured errors). Custom in-app feedback form for general feedback (small backend endpoint + UI component, per-stack boilerplate).
2. **GitHub Issues as the storage backend.** No intermediate database. Both tiers create GitHub Issues with structured labels (`feedback:from-sentry`, `feedback:user-submitted`, `type:bug|feature|other`). The work queue is unified — developer-filed and user-filed issues live side-by-side.
3. **Auto-reply via AWS SES** (transactional email, per ADR-0006 secrets posture). Submit-time confirmation if email provided; status update on `closed:fixed` resolution. No reply for `closed:wontfix` or `:invalid` (avoid implying judgment).
4. **Rate limiting**: per-IP (default 10/hour), honeypot field, optional Cloudflare Turnstile for high-traffic projects.
5. **`triage-bot` agent gains GitHub Issues with `feedback:*` labels as a third input source.** Same classification + dedup + customer-advocate lens behavior; just an additional source. Silent-loss and visible-failure feedback gets escalated to head-agent digest immediately rather than waiting for daily.
6. **Privacy posture:** email field is optional with clear opt-in language; screenshots are PII-scrubbed server-side; no tracking IDs / cookies / fingerprints; data retention follows GitHub Issues; user-requested deletion is honored by editing the issue.

## Consequences

### Positive

- Reuses existing infrastructure: Sentry, GitHub Issues, AWS SES, `triage-bot`. No new vendor.
- Unified work queue: user feedback and developer-filed issues live in the same place, processed by the same triage.
- The `triage-bot`'s customer-advocate lens (per ADR-0011 §6) directly applies to user feedback — exactly the use case the lens was designed for.
- Two-tier pattern fits the actual UX (error-context vs general feedback) without forcing one widget to serve both poorly.
- Polished portfolio signal: "real user feedback flowing into the work queue with AI triage" is a strong story.
- Privacy posture is strong by default (optional email, scrubbed screenshots, clear notice).

### Negative

- **Backend endpoint per project.** Each project needs `/api/feedback` and `/api/sentry-feedback`. Mitigated by per-stack boilerplate; ~50 lines of code per project.
- **SES setup per project for auto-reply.** Optional; silent triage is acceptable if SES isn't wired.
- **Spam vector.** Rate limiting + honeypot + (optional) Turnstile mitigate; not eliminate. Real spam attempts will surface and need response.
- **`triage-bot` token usage rises** as user feedback flows in. Estimated +$1/mo per project at moderate volume; tracked via the digest.
- **Screenshot scrubbing** requires server-side image processing (heuristic face/email/PII detection). Real cost in code complexity; mitigated by using a library (e.g., a small image-redaction service) rather than rolling from scratch.

### Neutral

- We're committing to GitHub Issues as the storage backend. Future migration to Linear/Jira is mechanical (the `triage-bot` agent, in Cowork context with connectors, can already cross-post; full migration would require backfilling).
- Public roadmap / voting is explicitly out of scope. Projects that want this can adopt Canny/Featurebase via project ADR — they layer on top, not replace.
- Customer support (with SLAs, ticket lifecycle, agent assignment) is explicitly out of scope. Support is a different discipline; this ADR covers feedback only.

## Pros and Cons of the Options

### Sub-decision 1: Widget pattern

| Option | Trade-off |
|---|---|
| **Single widget (general form only)** | Simpler; misses error-context feedback that Sentry can capture for free. |
| **Two-tier (Sentry User Feedback + custom form)** (chosen) | Best UX per context; reuses Sentry's free SDK feature; more wiring but each piece is small. |
| **`mailto:` link** | Zero infrastructure; loses structure, dedupe, and AI triage. |
| **Dedicated platform** (Canny, Featurebase) | Built-in voting/roadmap; vendor cost + lock-in; overkill at solo scale. |

### Sub-decision 2: Storage backend

| Option | Trade-off |
|---|---|
| **GitHub Issues** (chosen) | Unified work queue; reuses existing tracker; free; native triage integration. |
| **Intermediate DB then issues** | More flexible; adds complexity; loses the work-queue unification. |
| **Linear/Jira directly** | Tighter integration with existing PM tool; vendor-specific; requires connector in CI which is awkward (per Gap 2 of execution contexts). |
| **Custom feedback DB** | Maximum control; reinventing what GitHub Issues provides. |

### Sub-decision 3: Auto-reply policy

| Option | Trade-off |
|---|---|
| **None — silent triage** | Zero infra; users wonder if their feedback got through. |
| **Submit-confirmation only** | Acknowledges receipt; no follow-up loop. |
| **Submit + close-status updates if email provided** (chosen) | Closes the loop where the user opted in; respects no-email submissions. |
| **Full ticketing-style updates** (status changes, assignments, etc.) | Higher engagement; significant infrastructure; out of scope for solo. |

### Sub-decision 4: Rate limiting / abuse prevention

| Option | Trade-off |
|---|---|
| **None** | Simplest; spam vector; bad faith actors can DOS the form or pollute the queue. |
| **Per-IP rate limit only** | Catches naive spam; sophisticated bots rotate IPs. |
| **Per-IP + honeypot** (chosen baseline) | Catches naive bots cheaply; honeypot is invisible to users. |
| **Per-IP + honeypot + Turnstile** (chosen, opt-in) | Catches sophisticated spam; only triggered on rate-limit hit; better UX than CAPTCHA. |
| **Required CAPTCHA** | Maximum spam protection; significant friction; many real users abandon. |

### Sub-decision 5: Triage flow

| Option | Trade-off |
|---|---|
| **Manual triage by human** | Maximum quality; rots; doesn't scale. |
| **`triage-bot` ingests `feedback:*` labeled issues** (chosen) | Reuses the agent's existing classification + customer-advocate lens; consistent triage; near-zero marginal cost. |
| **Separate "feedback-triager" agent** | Specialized prompt; redundant with `triage-bot` (the lens is the same). |
| **No triage; route everything to head-agent inbox** | Surfaces every signal; defeats the purpose of having an agent. |

## Implementation notes

- Standards doc: [`docs/standards/11-user-feedback.md`](../standards/11-user-feedback.md).
- Per-stack boilerplate (`/api/feedback` endpoint + UI widget) added to `templates/python-service/` and (when written) `templates/typescript-app/`. Pending implementation; tracked as Task #25.
- `triage-bot` agent's system prompt updated to add the GitHub-issues input source. Pending implementation; tracked alongside execution-contexts work in the same change.
- SES setup: per-project; deferred until first project enables auto-reply. Sender domain verification is a one-time AWS console step.
- Sentry webhook setup: per-project; documented in the Sentry User Feedback section of the standards doc.
- Image-redaction library choice: TBD on first implementation. Candidates: `Pillow` + `face-recognition` (Python); cloud services (AWS Rekognition for face detection). Defer to project ADR.

## Links

- [Sentry User Feedback docs](https://docs.sentry.io/platforms/javascript/user-feedback/)
- [GitHub Issues API](https://docs.github.com/en/rest/issues/issues)
- [AWS SES (Simple Email Service)](https://aws.amazon.com/ses/)
- [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/)
- [GDPR data minimization principles](https://gdpr-info.eu/art-5-gdpr/) — informs the optional-email + retention posture.
- ADR-0006 (Secrets) — PII discipline applied to feedback.
- ADR-0009 (Observability) — Sentry as the existing error-tracking layer.
- ADR-0011 (AI workflows) — `triage-bot` definition extended with new input source.
- [MADR 4.x](https://adr.github.io/madr/) — ADR format used.
