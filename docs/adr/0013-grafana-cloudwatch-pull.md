# ADR-0013: Grafana Cloud — pull from CloudWatch over Metric Streams push

- **Status:** Accepted
- **Date:** 2026-05-12
- **Deciders:** Jason
- **Tags:** observability, grafana, cloudwatch, aws, iam

> Format: MADR 4.x (single-decision form). See [`template.md`](template.md).

## Context and Problem Statement

ADR-0009 chose Grafana Cloud as the dashboard layer over AWS-native CloudWatch storage. That ADR left the *transport* unspecified — Grafana Cloud supports two ways to get CloudWatch data into a dashboard, and the choice has real operational and cost implications.

The question: how does Grafana Cloud actually read CloudWatch metrics and logs — by *pulling* (query CloudWatch on demand via a cross-account IAM role) or by *pushing* (have AWS stream metrics out via CloudWatch Metric Streams → Kinesis Firehose → Grafana Cloud)?

Decision needed before first project implementation. Picked while wiring Grafana into game-night-pwa (the platform's proving-ground project).

## Decision Drivers

- **Solo-scale latency budget.** Sentry already owns sub-minute alerting. Dashboard freshness within 1-2 minutes is acceptable; sub-minute is overkill.
- **Per-resource cost.** Push pattern accrues Kinesis Firehose data + per-metric Metric Streams charges. Pull pattern has no incremental data charges (Grafana Cloud's free tier covers query volume at our scale).
- **Operational complexity.** Push pattern introduces a Firehose + Metric Stream resource per region. Pull pattern is one IAM role.
- **IaC reviewability.** Whichever option lands in `terraform/envs/prod/`, the change should be reviewable in a single small PR.
- **Template propagation.** The pattern is bound for the platform template; whichever is chosen will be applied to every future project.
- **Vendor lock-in symmetry.** Both options use Grafana Cloud's AWS data-source integration; neither makes future migration to a different observability viewer harder than the other.

## Considered Options

- **Option A: Pull — CloudWatch data source via cross-account IAM role.** Grafana Cloud assumes a role in our AWS account when a dashboard panel loads; queries CloudWatch APIs on demand.
- **Option B: Push — CloudWatch Metric Streams + Kinesis Firehose → Grafana Cloud.** AWS streams metric data points out to Grafana in near-real-time.

## Decision Outcome

Chosen option: **Option A — Pull.**

The decisive factor: sub-minute latency is not a requirement at solo scale, and the push pattern's ongoing Firehose/Streams costs and operational surface area buy nothing we need. Sentry already owns the synchronous-alert path (ADR-0009 §4); Grafana is for visibility, not for paging. Push becomes the right call once we have an on-call rotation that needs near-real-time dashboards during incidents. Until then, pull is industry-default for small/medium AWS-on-Grafana setups.

## Consequences

### Positive

- **One IAM role per project.** Minimum-viable setup. Reviewable in a single small PR.
- **No incremental AWS charges.** Pull pattern is free at our query volume.
- **Standard cross-account IAM pattern.** Reusable mental model — same shape as Grafana data source, AWS CLI cross-account work, GitHub OIDC roles. The IAM trust + permissions pattern transfers.
- **Confused-deputy hardening for free.** Grafana's data source UI requires an external ID to be set on the trust policy — there's no way to misconfigure this insecurely.

### Negative

- **1-2 minute dashboard latency.** CloudWatch standard-resolution metrics have ingestion lag plus Grafana's query-time fetch. Acceptable today; will become limiting if the project ever needs live incident dashboards.
- **Per-dashboard-view query cost.** Every dashboard view re-queries CloudWatch. At very high view rates this can hit CloudWatch API rate limits or accrue minor `GetMetricData` charges. Not a concern at solo scale.
- **Migration to push is non-trivial.** If we ever cross the latency-requirements threshold, switching to push means adding Firehose + Metric Streams + a Grafana endpoint in addition to the existing role. Reversible but not trivial.

### Neutral

- **Grafana's external ID is per-stack, not rotatable on demand.** The external ID is assigned by Grafana when you create the data source. It's not a secret we control. The hardening it provides is genuine (a different Grafana customer can't trick Grafana into assuming our role) but it's not a rotation-able credential.

## Pros and Cons of the Options

### Option A: Pull — CloudWatch data source via cross-account IAM role

- ✅ Pro: Minimum-viable surface area (one IAM role).
- ✅ Pro: No incremental AWS data charges at our query volume.
- ✅ Pro: Same IAM trust pattern as other Grafana-style integrations the developer will encounter.
- ✅ Pro: Confused-deputy hardening enforced by Grafana's UI (external ID required, can't skip).
- ❌ Con: 1-2 minute lag from emission to dashboard visibility.
- ❌ Con: Every dashboard view re-queries CloudWatch. Doesn't scale to many users hitting many dashboards.

### Option B: Push — CloudWatch Metric Streams + Firehose

- ✅ Pro: Near-real-time dashboards (sub-minute).
- ✅ Pro: One-time push; subsequent dashboard views hit Grafana's cached data, not CloudWatch APIs.
- ❌ Con: Firehose + Metric Streams + IAM + Grafana Cloud endpoint — meaningfully more moving parts.
- ❌ Con: Ongoing data charges (small but nonzero — Firehose is per-GB-ingested).
- ❌ Con: Streamed-out metrics are a copy; the canonical source is still CloudWatch, so logs can't follow the same path (logs require the pull-side anyway for Logs Insights queries).

## Implementation notes

- **Trust policy:** principal = Grafana's published AWS account ID (per Grafana Cloud region); `sts:ExternalId` condition pinned to the per-stack external ID shown in the Grafana data source UI.
- **Permissions:** read-only on CloudWatch metrics, CloudWatch Logs, EC2 region/tag discovery, and Resource Groups Tagging. Resource scope `"*"` because CloudWatch's metric APIs do not support resource-level IAM. Minimum set documented at <https://grafana.com/docs/grafana/latest/datasources/aws-cloudwatch/aws-authentication/>.
- **Standards doc:** [`docs/standards/06-observability.md`](../standards/06-observability.md) §5 — concrete setup steps added in the same change set as this ADR.
- **First implementation:** `terraform/envs/prod/grafana.tf` in game-night-pwa (commit aaeb971, PR #30, merged 2026-05-12).
- **Template propagation:** when the platform template adds a `grafana.tf` module, it inherits this pattern. Re-evaluate during platform-template work if push becomes warranted.

## Links

- [Grafana — AWS authentication for CloudWatch data source](https://grafana.com/docs/grafana/latest/datasources/aws-cloudwatch/aws-authentication/) — minimum permissions set.
- [AWS — CloudWatch Metric Streams](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Metric-Streams.html) — the push option this ADR rejected.
- [AWS — Confused deputy problem](https://docs.aws.amazon.com/IAM/latest/UserGuide/confused-deputy.html) — context for the `sts:ExternalId` hardening.
- [ADR-0009](0009-observability.md) — parent decision that chose Grafana Cloud as the dashboard layer; this ADR narrows the *how*.
