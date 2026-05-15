# Standard 06 — Observability

**Status:** 🟩 Decided (2026-05-08)
**ADRs:** [ADR-0009](../adr/0009-observability.md) (overall shape) · [ADR-0013](../adr/0013-grafana-cloudwatch-pull.md) (Grafana pull vs push)

The runtime story closer. Auto-rollback's health checks live here. `triage-bot`'s ingestion source lives here. ADR-0006's PII-redaction rule gets operationalized here.

The architectural shape: **AWS-native services for storage** (CloudWatch Logs/Metrics, X-Ray) + **Grafana Cloud as viewer/dashboard/alerting front-end** + **Sentry for error tracking** + **OTEL-compatible instrumentation** in app code.

## Summary

| Concern | Choice |
|---|---|
| Logs | JSON structured (OTEL field names) → **CloudWatch Logs** |
| Custom metrics | **CloudWatch EMF** (Embedded Metric Format) in log lines |
| Traces | **AWS X-Ray** with OTEL-compatible instrumentation |
| Errors | **Sentry** (free tier) |
| Dashboards | **Grafana Cloud** (defined via Terraform `grafana/grafana` provider) |
| Alerting | **Grafana Alerting** as primary; CloudWatch Alarms for billing/IAM only |
| Health checks | `/health` + `/ready` per service; 15-min watch window post-deploy |
| PII | Redacted at log-emission time per ADR-0006 PII tags |

## 1. Logging

### Format — JSON structured with OTEL field names

```json
{
  "timestamp": "2026-05-08T14:32:11.123Z",
  "severity_text": "INFO",
  "severity_number": 9,
  "message": "User signed in",
  "trace_id": "0af7651916cd43dd8448eb211c80319c",
  "span_id": "b7ad6b7169203331",
  "service.name": "game-night",
  "service.version": "1.4.2",
  "deployment.environment": "prod",
  "user_id_hash": "a3f1b...",
  "request_id": "req-abc123"
}
```

Field names follow [OpenTelemetry semantic conventions](https://opentelemetry.io/docs/specs/semconv/) so the logs are forward-compatible with full OTEL adoption later. Use the platform's logging library wrappers (per stack) — they enforce the schema.

### Destinations

| Stack | Primary destination | Why |
|---|---|---|
| AWS-deployed (Lambda, ECS, EC2) | **CloudWatch Logs** | Native; free tier generous; queryable via Logs Insights; SAP-C02-canonical. |
| Vercel-deployed | **Vercel Logs** + optional CloudWatch Logs forwarding | Vercel-native first; forward to CloudWatch via runtime function if cross-stack querying matters. |
| Local dev | stderr (pretty-printed by the logging library when `LOG_FORMAT=pretty`) | Human-readable in console; one env var switches format. |

### Levels

| Level | When |
|---|---|
| `FATAL` | Service is dying / cannot continue |
| `ERROR` | A request failed; user-visible problem |
| `WARN` | Anomaly worth noting; service still functional |
| `INFO` | Normal-flow events worth recording (auth, deploys, key business events) |
| `DEBUG` | Implementation detail; off in prod |

Default `LOG_LEVEL` per env: `prod=INFO`, `staging=INFO`, `dev=DEBUG`. Configurable per service via env var.

### PII redaction (cross-cut from ADR-0006)

The platform's logging library reads PII tags from the data model schema. At emission time:

- Fields tagged `pii=true` are stripped from the log entry before serialization.
- A stable hash of the value is logged in their place (e.g., `user_id_hash`) so log lines remain joinable for debugging.
- Some fields support partial redaction (e.g., last-4 of card number); per-field configuration via the tag's metadata.

The `security-reviewer` subagent verifies that new code emitting log lines respects PII tags during PR review.

### Retention

| Env | Retention | Approximate cost (CloudWatch) |
|---|---|---|
| dev | 7 days | <$1/mo at solo scale |
| staging | 30 days | <$1/mo |
| prod | 90 days (extendable per compliance need) | $1–5/mo |

Configured per log group via the IaC observability baseline module.

## 2. Metrics

### Custom metrics — CloudWatch EMF (Embedded Metric Format)

Custom metrics emitted from app code use [CloudWatch EMF](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format_Specification.html) — JSON log lines that CloudWatch parses into metrics:

```json
{
  "_aws": {
    "Timestamp": 1715179931123,
    "CloudWatchMetrics": [{
      "Namespace": "GameNight",
      "Dimensions": [["service", "env"]],
      "Metrics": [
        {"Name": "PlayerJoinLatency", "Unit": "Milliseconds"},
        {"Name": "PlayerJoinAttempts", "Unit": "Count"}
      ]
    }]
  },
  "service": "game-night",
  "env": "prod",
  "PlayerJoinLatency": 142.3,
  "PlayerJoinAttempts": 1
}
```

EMF is cheaper than direct `PutMetricData` API calls because metrics piggyback on existing log infrastructure. The platform's logging library exposes `emit_metric(...)` helpers that produce correctly-shaped EMF.

### AWS-emitted metrics

CloudWatch Metrics from AWS resources (Lambda invocations, ECS task counts, RDS connection counts, etc.) come for free with the resources. The IaC observability baseline module enables Container Insights / Lambda Insights for richer per-service breakdowns.

## 3. Tracing

### Instrumentation — OpenTelemetry SDK

App code instruments via OTEL SDK regardless of stack:

```python
# Python — one-time setup
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

trace.set_tracer_provider(TracerProvider())
trace.get_tracer_provider().add_span_processor(
    BatchSpanProcessor(OTLPSpanExporter(endpoint=os.environ["OTEL_EXPORTER_OTLP_ENDPOINT"]))
)
```

The exporter target is set via `OTEL_EXPORTER_OTLP_ENDPOINT` at deploy time:

| Env | Exporter target |
|---|---|
| AWS (prod / staging / dev) | AWS X-Ray (via the [AWS Distro for OpenTelemetry](https://aws-otel.github.io/) — ADOT) |
| Vercel | Sentry Performance |
| Local dev | Console exporter (traces print to stderr) |

### Why OTEL + X-Ray rather than X-Ray SDK directly

OTEL is vendor-neutral. If we later swap to Honeycomb or Grafana Tempo, the app code doesn't change — only the exporter config does. AWS X-Ray remains the default for AWS-deployed projects (SAP-C02-canonical) but the path off it is open.

## 4. Error tracking — Sentry

| Concern | Setup |
|---|---|
| SDK | Sentry SDK per stack (`sentry-sdk` for Python, `@sentry/node` / `@sentry/react` for TS) |
| Source maps | Uploaded on every release tag (Sentry CLI in CI) |
| Release tracking | Sentry release = the Conventional-Commits-driven Git tag (auto-wired via Sentry's GitHub integration) |
| Per-env scope | `dev` / `staging` / `prod` environment tag; per-env DSNs via secrets manager |
| PII | Sentry's [data-scrubbing](https://docs.sentry.io/platforms/python/data-management/sensitive-data/) configured to drop fields matching the platform's PII tag list |

Free tier (5K events/month) covers solo work easily. The portfolio signal of "we use Sentry, properly configured" is non-trivial.

## 5. Dashboards — Grafana Cloud, JSON-as-code

### The architectural shape

Grafana Cloud is the *viewer*; AWS services (CloudWatch, X-Ray) are the *storage*. Grafana queries cloud data sources directly at view time — no data ingestion to Grafana, no egress costs from AWS, full source-of-truth in CloudWatch.

**Transport: pull, not push** (per [ADR-0013](../adr/0013-grafana-cloudwatch-pull.md)). Grafana Cloud assumes a cross-account IAM role in our account and queries CloudWatch on demand when a dashboard panel loads. CloudWatch Metric Streams + Firehose (push) was considered and rejected for solo scale; revisit if real-time incident dashboards become a requirement.

### Setup (one-time per AWS account)

1. **Create the Grafana Cloud account.** Free tier: 10K active series, 50GB logs query, 3 users. Pick a stack URL like `<username>.grafana.net`.

2. **Read Grafana's expected trust-policy values.** Add a CloudWatch data source in the Grafana UI (Connections → Add new connection → AWS CloudWatch → CloudWatch datasource), then expand the "How to create an IAM role for grafana to assume" accordion. Note two values:
   - The Grafana AWS account ID Grafana wants to allow as the principal.
   - The per-stack external ID Grafana requires in the trust policy.

3. **Provision the IAM role via Terraform.** In `terraform/envs/prod/grafana.tf`, create a role whose trust policy allows Grafana's AWS account to `sts:AssumeRole` only when `sts:ExternalId` matches the per-stack external ID. Attach an inline policy granting the minimum permissions (see "Required permissions" below). Apply with `tofu apply`.

4. **Finish the data source.** Back in the Grafana UI, paste the role ARN (from the Terraform output) into the "Assume Role ARN" field. Set "Default Region" to the project's primary AWS region. Click **Save & test** — both the metrics API and the Logs API should report success.

5. **Import the platform's default dashboards** (see "Default dashboards" below). For each: Dashboards → New → Import → upload the JSON file or paste contents → pick the CloudWatch data source on the import dialog.

### Required permissions (minimum set, per Grafana's docs)

| Service | Actions |
|---|---|
| CloudWatch metrics | `cloudwatch:DescribeAlarms`, `cloudwatch:DescribeAlarmsForMetric`, `cloudwatch:DescribeAlarmHistory`, `cloudwatch:ListMetrics`, `cloudwatch:GetMetricData`, `cloudwatch:GetMetricStatistics`, `cloudwatch:GetInsightRuleReport` |
| CloudWatch Logs | `logs:DescribeLogGroups`, `logs:DescribeLogStreams`, `logs:GetLogGroupFields`, `logs:StartQuery`, `logs:StopQuery`, `logs:GetQueryResults`, `logs:GetLogEvents` |
| EC2 discovery | `ec2:DescribeRegions`, `ec2:DescribeInstances`, `ec2:DescribeTags` |
| Resource Groups Tagging | `tag:GetResources`, `tag:GetTagKeys`, `tag:GetTagValues` |

Resource scope is `*` for all of the above — CloudWatch's metric APIs do not support resource-level IAM. Authoritative source: <https://grafana.com/docs/grafana/latest/datasources/aws-cloudwatch/aws-authentication/>.

### Dashboards as code — two acceptable paths

**Path A: JSON files, manual import (pragmatic default).** Commit dashboard JSON under `grafana/dashboards/`. Re-importing into a fresh Grafana stack is a single click per dashboard. Use the **Share dashboard → Export as code → "Share dashboard with another instance" toggle ON → Save to file** flow to produce stack-portable JSON (strips UID, namespace, internal IDs).

**Path B: Terraform-managed (advanced).** When Grafana state itself needs to be reproducible across stacks, add the [`grafana/grafana` Terraform provider](https://registry.terraform.io/providers/grafana/grafana/latest):

```hcl
resource "grafana_dashboard" "lambda_health" {
  config_json = file("${path.module}/../grafana/dashboards/lambda-health.json")
  folder      = grafana_folder.project.id
}
```

Path A is the default; Path B is a future option for projects that want full bidirectional dashboard IaC. Both store the JSON in `grafana/dashboards/`; only the *application* method differs. The `doc-keeper` agent surfaces uncommitted dashboard changes in the digest regardless of which path the project uses.

### Default dashboards (per environment, generated by the observability-baseline module)

| Dashboard | What it shows |
|---|---|
| **Lambda Health** *(implemented in game-night-pwa)* | Total + per-function invocations / duration / errors / throttles across all project Lambdas. Imported from Grafana's suggested-dashboards catalog ("AWS Lambda"). |
| **Service Overview** *(spec; not yet implemented)* | Request rate, error rate (5xx/4xx), p50/p95/p99 latency, top endpoints by traffic + error |
| **Resource Health** *(spec)* | CPU/memory/disk per compute (Lambda concurrency, ECS task health) |
| **Errors** *(spec)* | Sentry error trend, top issues, regression markers from release tags |
| **Costs** *(spec)* | Daily spend per service (sourced from AWS Cost Explorer via Grafana Infinity data source) |
| **SLO** *(spec)* | Per-service SLO targets vs actuals (lightly defined; see §7) |

### Critical gotcha — Lambda's `Errors` metric

The `AWS/Lambda` namespace's `Errors` CloudWatch metric counts **unhandled exceptions and Lambda runtime timeouts only**. A Lambda handler that catches its own errors and returns `{ statusCode: 4xx, body: ... }` is treated by AWS as a successful invocation. Dashboard panels charting `Errors` will read flat even when the application is returning errors to users.

This is by design. Sentry covers the other slice — handler-caught errors that matter to the product. Don't read flat `Errors` panels as "no errors happening." Cross-reference with Sentry.

### Adding Sentry as a Grafana data source (cross-product dashboards)

The real value of Grafana over per-product consoles is the single-pane view
across CloudWatch + Sentry (+ later: X-Ray, custom data sources). Once the
CloudWatch data source is live, layering Sentry on top is a ~15-minute
manual setup.

**Step 1 — Install the Sentry data source plugin in Grafana.**

Grafana Cloud: Connections → Add new connection → search "Sentry" → the
plugin authored by Grafana Labs (not the community one) → Install.

Self-hosted Grafana: `grafana-cli plugins install grafana-sentry-datasource`,
then restart.

**Step 2 — Create a Sentry auth token scoped to Grafana's needs.**

In Sentry: User Settings → Auth Tokens → Create New Token. Minimum scopes:

| Scope | Why |
|---|---|
| `org:read` | List orgs the data source can pull from |
| `project:read` | List projects within the org |
| `event:read` | Query events (the data behind dashboard panels) |

Do NOT grant any write scopes — the data source only reads. Save the token
somewhere secure; you'll paste it once in step 3, then Grafana stores it
encrypted at rest.

**Step 3 — Add the data source in Grafana.**

Connections → Data sources → Add new data source → Sentry.
- Name: `sentry`
- URL: `https://sentry.io` (Sentry Cloud) or your self-hosted instance
- Auth token: paste from step 2
- Organization slug: your Sentry org slug
- Click Save & test → green checkmark.

**Step 4 — Add Sentry panels to existing dashboards.**

Highest-value panels to add to the project's main dashboard (e.g.
`lambda-health.json`):

1. **Error count by project, 24-hour rolling.** Query type: events.
   Catches error spikes that don't show up in CloudWatch (handler-caught
   4xx/5xx — see the Lambda Errors gotcha above).
2. **Release-tag annotations.** Sentry's release events overlay on metric
   panels as vertical markers. Makes "did this deploy break things"
   answerable in one glance.

Edit the dashboard → add new panel → data source: `sentry` → pick query
type → save.

**Step 5 — Re-export the dashboard JSON to capture the Sentry panels.**

The "Share dashboard → Export for sharing externally → Save to file" flow
strips Sentry-specific data source UIDs the same way it strips CloudWatch
ones; the importer picks the data source on import.

**Manual ops note.** Unlike CloudWatch's cross-account IAM role (Terraform
manageable), Sentry's auth token is a per-user secret created in the
Sentry UI — there's no clean IaC path for token rotation. Rotate manually
if compromise is suspected; document rotation procedure in the project's
runbook.

## 6. Alerting

### Severity tiers

| Severity | Trigger condition (examples) | Routing |
|---|---|---|
| **P0 (page)** | Auto-rollback failed; sustained 5xx > 50%; data-loss imminent | Email + push notification + `incident-responder` interrupts the human |
| **P1 (alert)** | Degraded service (p99 > 2× baseline; sustained 5xx > 5%); auto-rollback succeeded (after-action review needed) | Email + `incident-responder` opens issue; head-agent daily digest highlights |
| **P2 (notice)** | Anomaly (gradual error rate increase; one-off spike); SLO budget burning faster than expected | Head-agent weekly digest; `triage-bot` may file ticket |
| **P3 (info)** | Trend signals; not actionable yet | Logged only; aggregated into monthly review |

P0 is the only synchronous interrupt to the human. Aligned with ADR-0003.

### Mechanism — Grafana Alerting (primary) + CloudWatch Alarms (narrow)

**Grafana Alerting** owns most rules:

- Rules defined as code via the Grafana Terraform provider.
- Routing to webhooks: head agent endpoint (for P1+), email (all), push notification (P0).
- Unified across data sources (one rule can join CloudWatch metrics + Sentry events + X-Ray traces).

**CloudWatch Alarms** retained for narrow cases Grafana doesn't cover well:

- AWS Billing alarms (per-month budget thresholds — easier to wire via CloudWatch + AWS Budgets per ADR-0007)
- IAM credential anomalies (CloudTrail-based; better as CW Alarm)

The two systems' alerts both end at the same routing endpoints — the head agent doesn't care which system fired.

## 7. Health checks (auto-rollback's input)

Every service exposes the standard endpoints:

| Endpoint | Returns | Used by |
|---|---|---|
| `GET /health` | 200 if process responsive | Load balancers, smoke tests |
| `GET /ready` | 200 if ready to serve traffic (deps reachable, migrations applied) | Deploy gates |
| `GET /metrics` (optional, internal-only via VPC routing) | Prometheus text-format if needed | Optional Grafana scrape via Mimir scrape config |

### Auto-rollback thresholds

Per ADR-0003, after a prod deploy the workflow watches health for **15 minutes**. The metrics that trigger rollback:

| Metric | Healthy | Triggers rollback |
|---|---|---|
| HTTP 5xx rate | <1% of pre-deploy baseline | >5% sustained for 5 min |
| p99 latency | within 2× of pre-deploy baseline | >5× of baseline sustained for 5 min |
| Synthetic smoke test | passing | failing for 3 consecutive runs |
| Sentry release-tag error rate | <0.1% | >1% in first 15 min |

All four are evaluated by the `health-watch.yml` reusable workflow (per ADR-0007 / ADR-0003). Rollback is automated; the `incident-responder` agent triages post-rollback and pages on rollback failure.

## 8. SLOs (lightly defined)

For solo work, full SLO/error-budget discipline is overkill. Lightweight version:

| Metric | Default target |
|---|---|
| Availability (HTTP success rate) | 99.5% (≈ 3.6 hours/month downtime allowed) |
| Latency (p99) | <500ms for primary user paths |
| Error rate (5xx) | <0.5% |

Targets defined per service in the project's CLAUDE.md. Tracked in the SLO dashboard. Breaches don't trigger alerts on their own (P2 if sustained); they show up in the digest.

Don't get fancy with error-budget math at solo scale. The targets exist as a quality bar, not as a finance instrument.

## 9. Performance budgets (per ADR-0007 discipline)

| Workflow | Budget |
|---|---|
| Pre-commit | No observability checks — config validation only via syntax |
| App-only PR | 0s observability overhead — path filters on observability workflows |
| Observability-config PR (Grafana dashboards / Terraform changes) | ≤2 min: validate dashboard JSON, plan Terraform changes |
| Deploy | ≤30s for observability-related Terraform |
| Dashboard view (in Grafana) | <3s p95 — view-time concern, not commit-time |

Budget violations follow the ADR-0007 protocol: architect-led investigation, ADR-documented adjustment if justified.

## 10. Setup checklist

When bootstrapping a new project, the `new-project.sh` script will:

- [ ] Add the platform's logging library wrapper (per stack) with PII tag support
- [ ] Generate `OTEL_EXPORTER_OTLP_ENDPOINT` env var per environment in the secrets templates
- [ ] Wire OTEL SDK initialization into the project's startup
- [ ] Add Sentry SDK with per-env DSN injection
- [ ] Configure CloudWatch Logs retention per env (7 / 30 / 90 days)
- [ ] Wire the observability-baseline Terraform module (creates log groups, X-Ray sampling rules, Container Insights, IAM for Grafana cross-account)
- [ ] Provision Grafana data sources + default dashboards via the Grafana Terraform provider
- [ ] Add Sentry release-tagging step to the release workflow
- [ ] Add `/health` and `/ready` endpoint scaffolds with example deps checks
- [ ] Add `health-watch.yml` workflow integration for post-deploy monitoring
- [ ] Add per-service SLO targets to CLAUDE.md as defaults

## 11. Anti-patterns to avoid

- ❌ **Logging unredacted PII.** ADR-0006 makes this forbidden. The library handles it; don't bypass.
- ❌ **`print()` / `console.log` in production code.** Use the platform's structured logger.
- ❌ **Custom log fields not in OTEL semconv.** Forward-compatibility breaks.
- ❌ **Dashboards edited in the Grafana UI without committing the JSON.** The `doc-keeper` agent will flag drift.
- ❌ **Alerts that no one (or nothing) routes to.** An alert without a destination is worse than no alert.
- ❌ **P0/P1 alerts that fire frequently.** Severity tier corruption is silent — the human starts ignoring P0s. Tune the rules.
- ❌ **Missing `/health` endpoint.** Auto-rollback can't work without it. Required, not optional.
- ❌ **Sentry without source maps uploaded.** Stack traces become useless. Add the upload step to the release workflow.
- ❌ **Tracing too aggressively.** Sample rates matter. Default 10% in prod; 100% in dev.
- ❌ **Silent retention extension without ADR.** Increasing log retention from 90 days has cost and compliance implications. Worth the architect's attention.
