## Dependency Watch (2026-06-22)

**Manifest scanned:** `package.json` (repo root — 17 prod deps, 25 dev deps, 1 114 total installed)

---

## Security Advisories (`npm audit --omit=dev`)

Total: 0 critical · 0 high · 11 moderate · 1 low

### Moderate

| Package | Advisory | CVSS | Direct fix available? |
|---|---|---|---|
| `postcss` < 8.5.10 | [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) XSS via unescaped `</style>` in CSS Stringify output | 6.1 | No — bundled inside `next`; npm suggests downgrading to `next@9.3.3` (major, not viable) |
| `@opentelemetry/core` < 2.8.0 | [GHSA-8988-4f7v-96qf](https://github.com/advisories/GHSA-8988-4f7v-96qf) Unbounded memory allocation in W3C Baggage propagation | 5.3 | No — transitive via `@sentry/nextjs`; npm suggests downgrading Sentry to 6.3.5 (major, not viable) |
| `qs` 6.11.1–6.15.1 | [GHSA-q8mj-m7cp-5q26](https://github.com/advisories/GHSA-q8mj-m7cp-5q26) DoS — `qs.stringify` crashes on null/undefined in comma-format arrays | 5.3 | **Yes** — `npm audit fix` should resolve without a major bump |
| `uuid` < 11.1.1 | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) Missing buffer bounds check in v3/v5/v6 when `buf` is provided | 7.5 | No — transitive via `next-auth`; npm suggests downgrading to `next-auth@3.29.10` (major, not viable) |
| `@opentelemetry/instrumentation-http`, `@opentelemetry/resources`, `@opentelemetry/sdk-trace-base` | Downstream of `@opentelemetry/core` above | — | No (same Sentry major-downgrade caveat) |
| `@sentry/node`, `@sentry/nextjs`, `next-auth` | Downstream of `postcss` / `@opentelemetry/core` / `uuid` above | — | No (same caveats) |

> **Note on "fix not available" advisories:** npm audit recommends major *downgrades* for the `postcss`, `@opentelemetry/core`, and `uuid` chains (`next@9`, `@sentry/nextjs@6`, `next-auth@3`). These are non-starters. The actual fix path is to wait for the respective maintainers to publish patched releases in the current major branches (`next@16.x`, `@sentry/nextjs@10.x`, `next-auth@4.x`), then upgrade when available.

### Low

| Package | Advisory | CVSS | Fix available? |
|---|---|---|---|
| `@babel/core` ≤ 7.29.0 | [GHSA-4x5r-pxfx-6jf8](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8) Arbitrary file read via `sourceMappingURL` comment (dev-time tool, build context only) | 3.2 | Yes — `npm audit fix` (dev dependency; excluded from `--omit=dev` run but flagged here) |

---

## Version Updates (`npm outdated`)

### Major Bumps — Review for breaking changes before upgrading

| Package | Installed (wanted) | Latest | Risk note |
|---|---|---|---|
| `@octokit/rest` | 21.1.1 | **22.0.1** | Major bump; check changelog for breaking REST client changes |

### Notable Minor Bumps — 0.x pre-release or multi-version gap

| Package | Installed (wanted) | Latest | Risk note |
|---|---|---|---|
| `@anthropic-ai/sdk` | 0.96.0 | **0.105.0** | 9 minor versions behind in a 0.x package — 0.x minor bumps may be breaking; review Anthropic SDK changelog before upgrading |
| `googleapis` | 171.4.0 | **173.0.0** | 2 minor versions behind; no breaking changes expected but confirm before upgrading |

### Patch / Within-Range Updates — Low priority, batch in monthly sweep

| Package | Wanted | Latest |
|---|---|---|
| `next` | 16.2.6 | 16.2.9 |
| `react` | 19.2.4 | 19.2.7 |
| `react-dom` | 19.2.4 | 19.2.7 |
| `@dnd-kit/core` | 6.3.1 | 6.3.1 (at latest) |
| `@dnd-kit/sortable` | 10.0.0 | 10.0.0 (at latest) |
| `@dnd-kit/utilities` | 3.2.2 | 3.2.2 (at latest) |
| `@neondatabase/serverless` | 1.1.0 | 1.1.0 (at latest) |
| `@sentry/nextjs` | 10.59.0 | 10.59.0 (at latest) |
| `@tailwindcss/typography` | 0.5.20 | 0.5.20 (at latest) |
| `drizzle-orm` | 0.45.2 | 0.45.2 (at latest) |
| `jszip` | 3.10.1 | 3.10.1 (at latest) |
| `next-auth` | 4.24.14 | 4.24.14 (at latest) |
| `react-markdown` | 10.1.0 | 10.1.0 (at latest) |
| `remark-gfm` | 4.0.1 | 4.0.1 (at latest) |

> Packages listed at "at latest" appear in `npm outdated` because the locally installed version lags the semver-wanted version — a plain `npm install` or lock-file sync will resolve them without any package.json change.

---

## Recommended Actions

1. **Run `npm audit fix`** — resolves the `qs` DoS (moderate, CVSS 5.3) and the `@babel/core` low advisory without any major-version changes. Low risk.
2. **Upgrade `@anthropic-ai/sdk` → 0.105.0** — review the SDK changelog for breaking changes across 9 minor versions before merging. This is the project's primary AI dependency.
3. **Upgrade `@octokit/rest` → 22.0.1** — check the v22 migration guide; REST client interface changes are likely.
4. **Monitor upstream for `next@16.x` postcss patch and `@sentry/nextjs@10.x` OpenTelemetry patch** — no actionable fix today; track next.js and Sentry release notes.
5. **Batch patch sweep** — `next`, `react`, `react-dom` patch bumps plus lock-file sync for at-latest packages.
