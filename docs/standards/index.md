# Standards — decision queue

Each standards doc captures *what we do*. Each matching ADR captures *why we chose this over alternatives*. Until a standard is decided, this index is the source of truth for what's pending.

## Decision protocol

For each standard, before writing the doc:

1. **Research.** Pull what authoritative sources recommend (Google SRE / Eng Practices, ThoughtWorks Tech Radar, MS Engineering Playbook, Martin Fowler, language-specific style guides, GitHub Engineering, Spotify Engineering, etc.).
2. **Present options.** 2–4 viable approaches, each with tradeoffs.
3. **Recommend.** With reasoning — but the human discerns.
4. **Decide.** User confirms a path.
5. **Write.** Standards doc + ADR, together.

## Status legend

- 🟦 Pending — research not yet started
- 🟨 In research — gathering options
- 🟧 Awaiting decision — options presented, waiting on user
- 🟩 Decided — standards doc + ADR written

## The 11 standards

| # | Standard | Status | Doc | ADR |
|---|---|---|---|---|
| 1 | [Source control](01-source-control.md) | 🟩 | [`01-source-control.md`](01-source-control.md) | [`0002-source-control.md`](../adr/0002-source-control.md) |
| 2 | [CI/CD](02-ci-cd.md) | 🟩 | [`02-ci-cd.md`](02-ci-cd.md) | [`0003-ci-cd.md`](../adr/0003-ci-cd.md) |
| 3 | [Testing](03-testing.md) | 🟩 | [`03-testing.md`](03-testing.md) | [`0004-testing.md`](../adr/0004-testing.md) |
| 4 | [Quality gates](04-quality-gates.md) | 🟩 | [`04-quality-gates.md`](04-quality-gates.md) | [`0005-quality-gates.md`](../adr/0005-quality-gates.md) |
| 5 | [Documentation](05-documentation.md) | 🟩 | [`05-documentation.md`](05-documentation.md) | [`0008-documentation.md`](../adr/0008-documentation.md) |
| 6 | [Observability](06-observability.md) | 🟩 | [`06-observability.md`](06-observability.md) | [`0009-observability.md`](../adr/0009-observability.md) |
| 7 | [Secrets management](07-secrets.md) | 🟩 | [`07-secrets.md`](07-secrets.md) | [`0006-secrets.md`](../adr/0006-secrets.md) |
| 8 | [Infrastructure as code](08-iac.md) | 🟩 | [`08-iac.md`](08-iac.md) | [`0007-iac.md`](../adr/0007-iac.md) |
| 9 | [Release management](09-release-management.md) | 🟩 | [`09-release-management.md`](09-release-management.md) | [`0010-release-management.md`](../adr/0010-release-management.md) |
| 10 | [AI workflows](10-ai-workflows.md) | 🟩 | [`10-ai-workflows.md`](10-ai-workflows.md) | [`0011-ai-workflows.md`](../adr/0011-ai-workflows.md) |
| 11 | [User feedback](11-user-feedback.md) | 🟩 | [`11-user-feedback.md`](11-user-feedback.md) | [`0012-user-feedback.md`](../adr/0012-user-feedback.md) |

ADR-0001 documents the platform's overall architecture and the choice to organize standards this way. **ADR numbers are assigned in creation order**, so they may not match the standard number — see each row's ADR link for the actual assignment.

## Working order suggestion

1. **Source control** first — everything else builds on commit/branch/PR conventions.
2. **CI/CD** next — the runner that enforces the rest.
3. **Quality gates + Testing** together — they're tightly linked.
4. **Documentation** — including the ADR cadence itself.
5. **Observability + Secrets** — runtime concerns; relevant once you're deploying.
6. **IaC** — needed for SAP-C02 portfolio work specifically.
7. **Release management** — meaningful only once you have something to release.
8. **AI workflows** last — it depends on all the prior decisions to know what to enforce.
