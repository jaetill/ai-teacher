# ADR-0009: Observability — AWS-native storage + Grafana viewer + Sentry errors

- **Status:** Accepted
- **Date:** 2026-05-08
- **Deciders:** Jason
- **Tags:** observability, logging, metrics, tracing, grafana, sentry, aws

> Format: MADR 4.x (bundled sub-decisions form). See `template.md`.

## Context and Problem Statement

ADR-0003 (CI/CD) granted AI shipping authority and made auto-rollback a load-bearing safety layer. Auto-rollback only works if it has health signals to watch. The proactive `triage-bot` agent (added 2026-05-08) needs structured logs to ingest. ADR-0006 mandated PII redaction in logs. None of these can function without a defined observability standard.

The question: which logging, metrics, tracing, error-tracking, dashboard, and alerting choices give a solo developer SAP-C02-canonical AWS observability with portfolio-grade visualization, without per-commit overhead?

This ADR bundles five sub-decisions because logging format, metrics emission, tracing instrumentation, dashboard tool, and alerting routing are interdependent — flipping any one ripples through the others.

## Decision Drivers

- **Auto-rollback requires health signals.** The whole CI/CD safety net (ADR-0003) is downstream of this ADR.
- **`triage-bot` requires structured logs.** Unstructured text is not reliably parseable for proactive error scanning.
- **PII redaction obligation** (ADR-0006). Live data in Game Night means logs must scrub PII at emit time.
- **SAP-C02 portfolio relevance.** AWS-native observability (CloudWatch + X-Ray) is canonical SAP-C02 material.
- **Job-search portfolio signal.** "We use Grafana over CloudWatch with Sentry for errors" is the actual stack mature orgs run; stronger signal than "all CloudWatch."
- **Performance discipline** (ADR-0007). App-only commits must have zero observability-pipeline overhead.
- **Vendor-neutrality.** App-code instrumentation should not lock us to one observability vendor; future migrations should be config-only.
- **Solo cost.** Free tiers must cover normal usage. No surprise bills.

## Considered Options

The bundle has five sub-decisions:

- **Sub-decision 1 — Logging format + destination:** chose **JSON structured (OTEL field names) → CloudWatch Logs**
- **Sub-decision 2 — Error tracking:** chose **Sentry**
- **Sub-decision 3 — Metrics + tracing:** chose **CloudWatch + EMF for metrics; AWS X-Ray with OTEL-compatible instrumentation for traces**
- **Sub-decision 4 — Dashboards + alerting:** chose **Grafana Cloud (over AWS-native storage) for dashboards + alerts; CloudWatch Alarms retained narrowly for billing/IAM**
- **Sub-decision 5 — Health checks:** chose **`/health` + `/ready` per service; standardized auto-rollback thresholds**

## Decision Outcome

We adopt the **AWS-native storage + Grafana viewer + Sentry errors** architecture:

1. **Logging:** JSON structured with OTEL semantic-convention field names → CloudWatch Logs (AWS) / Vercel Logs (Vercel) / pretty-printed stderr (local). PII redacted at emit time per ADR-0006 tags. Tiered retention (7/30/90 days).
2. **Error tracking:** Sentry with source maps uploaded per release; releases tracked as Conventional-Commits-driven Git tags; per-env DSNs.
3. **Custom metrics:** CloudWatch Embedded Metric Format (EMF) — metrics piggyback on log lines (cheaper than direct `PutMetricData`).
4. **Tracing:** OpenTelemetry SDK in app code; AWS Distro for OpenTelemetry (ADOT) exports to AWS X-Ray. Vendor-neutral instrumentation; backend swap is config-only.
5. **Dashboards:** Grafana Cloud (free tier) defined as code via the `grafana/grafana` Terraform provider. Grafana queries CloudWatch / X-Ray / Sentry directly via data-source plugins — no data ingestion, no egress costs.
6. **Alerting:** Grafana Alerting as primary (rules as code, unified across data sources, four severity tiers — P0 page, P1 alert, P2 notice, P3 info). CloudWatch Alarms retained narrowly for AWS Billing alarms and IAM/CloudTrail anomalies.
7. **Health checks:** Standardized `/health` and `/ready` endpoints per service. Auto-rollback (per ADR-0003) watches HTTP 5xx rate, p99 latency, synthetic smoke tests, and Sentry release-tag error rate over a 15-minute window.

## Consequences

### Positive

- Auto-rollback (ADR-0003) becomes operationally real — defined health signals, defined thresholds, defined fallback.
- `triage-bot` has a structured log substrate to ingest reliably.
- SAP-C02 stack signal preserved (CloudWatch + X-Ray remain the storage layer).
- Stronger portfolio signal than "all CloudWatch" — Grafana over AWS-native storage is the mature-org stack.
- Vendor-neutral instrumentation: OTEL in the app code means we can swap to Honeycomb / Tempo / Datadog later without app changes.
- PII redaction obligation operationalized end-to-end (tag → library → log → Sentry data scrubbing).
- Free-tier-friendly: AWS free tier + Grafana Cloud free tier + Sentry free tier cover solo work easily.
- Cost predictable: ~$1–10/mo across all observability tooling at solo scale.

### Negative

- **One additional vendor account** (Grafana Cloud). One more thing to set up; mitigated by ~30-min one-time bootstrap.
- **Two providers in Terraform** (AWS + Grafana). Slightly more complex per-project IaC; mitigated by the platform's observability-baseline shared module.
- **Sentry source-map upload step** required in release workflow. Adds ~10s to releases.
- **OTEL configuration overhead.** Each project needs OTEL SDK initialization wired into startup. Templates absorb most of this.
- **CloudWatch Alarms retained narrowly.** Two alerting systems to know about (Grafana Alerting + CloudWatch Alarms for billing/IAM). Slightly more complex mental model; mitigated by both routing to the same agent endpoints.

### Neutral

- We're not adopting full Grafana LGTM stack (Loki + Mimir + Tempo). Could revisit later if AWS storage becomes a bottleneck or if we want unified-source querying.
- AWS X-Ray as the primary tracing backend. Acceptable for AWS-native posture; a future move to Tempo or Honeycomb is config-only thanks to OTEL.
- SLOs lightly defined (99.5% availability, p99 latency targets per service). Not a full error-budget discipline. Appropriate for solo scale; can tighten later.

## Pros and Cons of the Options

### Sub-decision 1: Logging format + destination

| Option | Trade-off |
|---|---|
| **Plain text with conventions** | Simplest; readable in raw form; hard to query at scale; `triage-bot` parsing is fragile. |
| **JSON structured with OTEL field names** (chosen) | Machine-parseable; queryable in Logs Insights; OTEL-compatible for future migration. Requires logging library wrapper. |
| **Full OTEL log format (OTLP)** | Emerging standard; same format as traces/metrics; ecosystem still maturing in 2026; AWS support uneven. |

### Sub-decision 2: Error tracking

| Option | Trade-off |
|---|---|
| **Sentry (free tier)** (chosen) | Industry standard; recognized portfolio signal; great DX; auto-grouping, source maps, release tracking. Free tier 5K events/mo. |
| **CloudWatch only (errors as logs + alarms)** | No additional vendor; AWS-native; no grouping/dedup; no triage UI; painful for individual error inspection. |
| **Honeybadger / Rollbar** | Sentry alternatives; broadly comparable; less industry recognition. |
| **Self-hosted Sentry** | Free, full control; self-host overhead not worth it at solo scale. |

### Sub-decision 3: Metrics + tracing

| Option | Trade-off |
|---|---|
| **CloudWatch Metrics + EMF; AWS X-Ray; OTEL instrumentation** (chosen) | AWS-native storage (SAP-C02-canonical); EMF cheaper than `PutMetricData`; OTEL means vendor-neutral app code. |
| **Prometheus + Grafana Tempo** | More polished; self-host or paid; loses SAP-C02 stack relevance. |
| **Datadog** | Best-in-class; expensive; vendor lock-in. |
| **No tracing** | Free; loses ability to debug latency/error spikes across services. |

### Sub-decision 4: Dashboards + alerting

| Option | Trade-off |
|---|---|
| **CloudWatch Dashboards + CloudWatch Alarms** | Native; free; defined as Terraform; less polished visualization; AWS-only. Was the original recommendation. |
| **Grafana Cloud over AWS-native storage** (chosen) | Better visualization; cross-source unified dashboards; portfolio signal; one more vendor account; free tier covers solo. |
| **Full Grafana LGTM stack** (Loki + Mimir + Tempo) | Best of one ecosystem; loses SAP-C02 stack relevance; more cost; vendor lock-in. |
| **Datadog dashboards + alerting** | Excellent; expensive; vendor lock-in. |

The user's pushback during proposal review explicitly weighted the Grafana portfolio signal: *"the setup is worth it if it plays well with terraform, cloudwatch, OTEL, and all the other choices."* It does — Grafana has first-class data-source plugins for all three plus Sentry, and a mature Terraform provider for dashboards-as-code.

### Sub-decision 5: Health checks

| Option | Trade-off |
|---|---|
| **Standardized `/health` + `/ready` per service with auto-rollback thresholds** (chosen) | Auto-rollback (ADR-0003) becomes operationally real; standardization across stacks. |
| **Service-defined health (no convention)** | Flexible; auto-rollback can't generalize. |
| **No health endpoints** | Simplest; defeats ADR-0003's auto-rollback. Not viable. |

## Implementation notes

- Standards doc: [`docs/standards/06-observability.md`](../standards/06-observability.md).
- Observability-baseline shared Terraform module: `templates/_shared/terraform-modules/observability-baseline` — creates log groups with retention, X-Ray sampling rules, IAM cross-account role for Grafana, default Container Insights / Lambda Insights config. Authored as part of Task #14 (per-stack templates).
- Reusable workflows: `workflows/health-watch.yml`, `workflows/sentry-release.yml`. Authored as part of Task #15.
- Bootstrap script: `scripts/bootstrap-grafana.sh` — one-time per AWS account; creates the cross-account IAM role and Grafana data sources.
- Per-stack logging library wrappers (Python, TS) live in `templates/_shared/logging/`. They enforce the JSON schema and read PII tags from data models per ADR-0006.
- The `triage-bot` agent's CloudWatch Logs Insights queries (for proactive scanning) are part of its system prompt, authored as part of ADR-0011 (AI workflows).
- The `code-reviewer` and `security-reviewer` subagents check for unredacted PII in PR diffs per ADR-0005 and this ADR.

## Links

- [OpenTelemetry semantic conventions](https://opentelemetry.io/docs/specs/semconv/) — log/metric/trace field names.
- [AWS Distro for OpenTelemetry (ADOT)](https://aws-otel.github.io/) — OTEL → X-Ray exporter.
- [CloudWatch Embedded Metric Format](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format_Specification.html) — metrics-via-logs spec.
- [Grafana Terraform provider](https://registry.terraform.io/providers/grafana/grafana/latest) — dashboards-as-code.
- [Grafana Cloud free tier](https://grafana.com/products/cloud/) — current limits.
- [Sentry data scrubbing](https://docs.sentry.io/platforms/python/data-management/sensitive-data/) — server-side PII scrubbing.
- AWS Well-Architected Operational Excellence Pillar — observability rationale.
- ADR-0003 (CI/CD) — auto-rollback depends on this ADR's health checks.
- ADR-0006 (Secrets) — PII redaction obligation operationalized here.
- ADR-0007 (IaC) — performance budget discipline applied; observability-baseline as a shared module.
- ADR-0008 (Documentation) — dashboards-as-code committed in repo; doc-keeper surfaces drift.
- [MADR 4.x](https://adr.github.io/madr/) — ADR format used.
