# Standard 11 — User Feedback

**Status:** 🟩 Decided (2026-05-09)
**ADR:** [ADR-0012](../adr/0012-user-feedback.md)

How users of projects built on this platform submit bugs and feature requests, how that feedback flows into the work queue, and how it gets triaged. Cross-cuts ADR-0009 (Observability — Sentry), ADR-0011 (AI workflows — triage-bot), and the platform's GitHub Issues conventions.

## Summary

| Concern | Choice |
|---|---|
| Widget pattern | **Two-tier**: Sentry User Feedback (error-attached) + custom form (general) |
| Storage | **GitHub Issues** with structured labels — no intermediate DB |
| Auto-reply | Submit-time confirmation; status-update on resolution if email provided |
| Rate limiting | Per-IP at the backend; honeypot field; optional Turnstile for high-traffic projects |
| Privacy | Email collection **optional**; never required; clear privacy notice on form |
| Triage | `triage-bot` agent treats `feedback:*` labeled issues as a new input source |
| Reply mechanism | AWS SES (transactional) for projects that opt in; silent triage acceptable |

## 1. The two-tier widget pattern

Different feedback contexts need different UX. We use both, and they feed the same downstream queue.

### Tier 1 — Sentry User Feedback (error-attached)

When a user encounters an error and Sentry captures it, the [Sentry User Feedback widget](https://docs.sentry.io/platforms/javascript/user-feedback/) auto-prompts:

> "It looks like we're having issues. Tell us what happened?"

User adds context (what they were doing, what they expected). Sentry attaches the feedback to the error event.

**Routing:** Sentry forwards via webhook → project's `/api/sentry-feedback` endpoint → creates GitHub Issue with labels `feedback:from-sentry`, `type:bug`, plus the Sentry issue URL.

**Cost:** zero (Sentry SDK feature; we already have Sentry per ADR-0009).

### Tier 2 — Custom in-app feedback form (user-initiated)

For feature requests, general feedback, and non-error bugs. UI component: a "Feedback" button (footer or accessible from a `?` icon) opening a small form.

**Required fields:**

- Type: `bug` / `feature` / `other`
- Description (text, ≤2000 chars)

**Optional fields:**

- Email (for follow-up; explicit opt-in language)
- Screenshot (image upload, ≤2MB; redacted server-side for PII per ADR-0006)
- Page URL (auto-captured from `window.location.href`)

**Endpoint contract:** `POST /api/feedback`

```json
// Request
{
  "type": "bug" | "feature" | "other",
  "description": "string (required, 10..2000 chars)",
  "email": "string (optional, validated)",
  "screenshot": "base64 string (optional, ≤2MB after decode)",
  "page_url": "string (optional)",
  "user_agent": "string (auto-captured)"
}

// Response 201
{
  "id": "FB-2026-001234",
  "status": "received",
  "issue_url": "https://github.com/<owner>/<repo>/issues/<n>"  // optional
}

// Response 429 (rate-limited)
{
  "error": "rate_limited",
  "retry_after_seconds": 60
}
```

**Backend behavior:**

1. Validate input (type enum, description length, email format if present).
2. Rate-limit per IP: 10 submissions per hour (configurable).
3. Honeypot field check (a hidden form field that humans don't fill).
4. Strip PII from screenshots (server-side image processing).
5. Create GitHub Issue via API with:
   - Title: `[<type>] <first-60-chars-of-description>...`
   - Body: structured (description + page URL + user agent + Sentry context if available)
   - Labels: `feedback:user-submitted`, `type:<bug|feature|other>`
6. If email provided: send confirmation email via SES ("we got your feedback, ID #FB-2026-001234").
7. Return 201 with the feedback ID + GitHub issue URL.

## 2. GitHub Issues label scheme

| Label | Applied by | Meaning |
|---|---|---|
| `feedback:from-sentry` | Sentry webhook | User feedback attached to a Sentry error |
| `feedback:user-submitted` | `/api/feedback` backend | User-initiated form submission |
| `type:bug` | Backend (from form) or Sentry (default) | User reports something broken |
| `type:feature` | Backend (from form) | User requests new functionality |
| `type:other` | Backend (from form) | Doesn't fit bug or feature |
| `triage:high` / `triage:medium` / `triage:low` | `triage-bot` agent | Priority after triage |
| `user-impact:silent-loss` / `:visible-failure` / `:degraded` / `:internal` | `triage-bot` agent | Customer-advocate lens (per ADR-0011) |
| `area:<X>` | `triage-bot` agent | Affected area (auth, payments, etc.) |
| `closed:fixed` / `closed:duplicate` / `closed:wontfix` / `closed:invalid` | Resolver | Resolution category (used by status-update emails) |

## 3. Auto-reply policy

| Trigger | Action |
|---|---|
| User submits form with email | Send SES email immediately: "We received your feedback (ID #FB-...). We'll let you know if there's an update." |
| User submits form without email | No reply; silent acknowledgment via 201 response |
| Issue closed with `closed:fixed` and email is on file | Send SES email: "Update on your feedback (ID #FB-...): this is fixed in v<version>. Thanks for the report." |
| Issue closed with `closed:duplicate` | Optional: link to the canonical issue if public |
| Issue closed with `closed:wontfix` or `:invalid` | No automated reply (avoid implying judgment of the user's report) |

The reply pattern uses **AWS SES** (transactional email per ADR-0006 — no static keys; per-env IAM scope). Set up is per-project but simple given the platform's existing AWS posture.

For projects that don't want to wire SES: silent triage is acceptable. The user got their 201 with feedback ID; that's the contract.

## 4. Rate limiting and abuse prevention

Three layers:

1. **Per-IP rate limit** at the backend — default 10/hour. Implemented via in-memory counter, Redis, or DynamoDB depending on the project's existing storage.
2. **Honeypot field** — a hidden form field named `website` (or similar — bots auto-fill all fields). Submissions with the honeypot filled get 200-OK (so bots don't retry) but are silently dropped.
3. **Cloudflare Turnstile** (optional, opt-in) — for high-traffic projects experiencing real spam. Free; better UX than CAPTCHA. Triggered only when rate-limit is hit or other heuristics fire.

Abusive submissions auto-close after detection — `closed:invalid` label. Repeat abusers from the same IP get auto-banned at the rate-limit layer.

## 5. Privacy posture

Per ADR-0006 (Secrets) PII discipline:

- **Email field is optional and clearly opt-in.** UI text: "Optional. We only use this to follow up on your feedback. We won't subscribe you to anything."
- **Screenshots are PII-scrubbed server-side** before storage. Common scrub: faces blurred (heuristic detection), email addresses redacted, credit-card-shaped strings redacted.
- **No tracking IDs, cookies, or device fingerprints** captured beyond what's already in the user's session.
- **Privacy notice** linked from the feedback form.
- **Data retention:** GitHub Issues are kept indefinitely (they're the work record). User emails are stored ONLY in the GitHub Issue body (not separately) and follow GitHub's retention. If a user requests deletion, the issue gets edited to remove the email.

## 6. `triage-bot` integration

The `triage-bot` agent (per ADR-0011) gains user-feedback as a third input source alongside log scanning and Sentry errors. Updated input sources:

| Source | What `triage-bot` reads | Cadence |
|---|---|---|
| CloudWatch Logs Insights | ERROR-level lines + 5xx patterns | Daily |
| Sentry issues | New + active issues since last scan | Daily |
| **GitHub Issues with `feedback:*` labels** (NEW) | New + unresolved feedback | Daily |

Behavior on user feedback:

1. **Dedupe** — if a new feedback issue describes the same problem as an existing open issue, link them and increment a count rather than create a separate ticket.
2. **Classify** — apply `triage:<priority>`, `user-impact:<category>`, `area:<X>` labels.
3. **Route** — for user-impact `silent-loss` or `visible-failure` items, escalate to head-agent digest immediately (don't wait for daily). For lower-impact items, queue normally.
4. **Frame** — augment the issue with the customer-advocate lens (per ADR-0011 §6 Tier 2): "User reports X. ~N users may be affected if this is widespread. Hypothesized cause: ..."

## 7. Setup checklist (per project that wants user feedback)

When a project enables user feedback, the bootstrap script (or manual setup):

- [ ] Add the Sentry User Feedback widget to the frontend per Sentry SDK docs.
- [ ] Configure Sentry webhook → `/api/sentry-feedback` endpoint.
- [ ] Add the `/api/feedback` endpoint to the backend (boilerplate provided per stack).
- [ ] Add the in-app feedback widget UI component (boilerplate per stack).
- [ ] Configure GitHub Issue labels per §2.
- [ ] Configure SES + verified sender domain (optional; required for auto-reply).
- [ ] Add the `triage-bot` agent's GitHub-issues input source to its config.
- [ ] Add `docs/runbooks/spam-cleanup.md` (per-project).
- [ ] Add `docs/runbooks/feedback-triage-by-hand.md` for the rare case `triage-bot` is unavailable.
- [ ] Verify privacy notice link in the form footer.

## 8. What's NOT in this standard

- **Public roadmap / voting** — out of scope. Feedback is private (in GitHub Issues, not public discussions). Projects that want public roadmap can use GitHub Projects or add Canny/Featurebase via project ADR.
- **Customer support ticketing** — feedback is not the same as customer support. Support requires response SLAs, ticket lifecycles, agent assignment. Out of scope; use Zendesk/Intercom/etc. if needed.
- **In-app chat / live support** — out of scope.
- **NPS surveys / satisfaction polls** — out of scope; complementary signal but separate flow.

## 9. Anti-patterns to avoid

- ❌ **`mailto:` for feedback.** Emails get lost; no structure; no triage.
- ❌ **Direct backend → ticket without rate limiting.** Spam vector.
- ❌ **Required email field.** Friction; many users won't submit.
- ❌ **Unredacted screenshots stored permanently.** PII risk.
- ❌ **Auto-replying "we're working on it"** without a real status.
- ❌ **Manual triage of user feedback** — that's `triage-bot`'s job. Manual triage rots.
- ❌ **Storing feedback in a separate DB instead of GitHub Issues** — fragments the work queue; loses unification with developer-filed issues.
- ❌ **Silent rejection of low-quality feedback.** If you `closed:invalid`, log the reason; don't just delete.
