## Dependency Watch (2026-06-29)

### Manifest: `package.json` (root)

390 production dependencies · 612 dev dependencies · 1 low advisory · 11 moderate advisories · 0 high · 0 critical

---

### Security Advisories

> No CRITICAL or HIGH advisories detected. All findings are MODERATE or LOW.

#### MODERATE — action recommended

| Package | Advisory | CVSS | Direct cause | Fix path |
|---|---|---|---|---|
| `postcss` (via `next`) | [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) — XSS via unescaped `</style>` in CSS stringify | 6.1 | Bundled inside `next` | No realistic in-range patch; monitor Next.js releases for postcss upgrade |
| `uuid` (via `next-auth`) | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) — Missing buffer bounds check in v3/v5/v6 | 7.5 | Transitive via `next-auth` | No in-range fix; `next-auth` v5 resolves it (major migration required) |
| `@opentelemetry/core` (via `@sentry/nextjs`) | [GHSA-8988-4f7v-96qf](https://github.com/advisories/GHSA-8988-4f7v-96qf) — Unbounded memory allocation in W3C Baggage propagation | 5.3 | Transitive via Sentry | No in-range fix; awaiting `@sentry/nextjs` upgrade to OpenTelemetry ≥ 2.8.0 |
| `qs` | [GHSA-q8mj-m7cp-5q26](https://github.com/advisories/GHSA-q8mj-m7cp-5q26) — DoS via `qs.stringify` crash on null entries | 5.3 | Transitive (exact dependent unknown) | Fix available — run `npm audit fix` |
| `@opentelemetry/instrumentation-http` | Inherits `@opentelemetry/core` CVE | 5.3 | Transitive via `@sentry/node` | Same as above (Sentry upstream) |
| `@opentelemetry/resources` | Inherits `@opentelemetry/core` CVE | 5.3 | Transitive via `@sentry/node` | Same as above |
| `@opentelemetry/sdk-trace-base` | Inherits `@opentelemetry/core` CVE | 5.3 | Transitive via `@sentry/node` | Same as above |
| `@sentry/node` | Inherits OpenTelemetry CVE chain | 5.3 | Transitive via `@sentry/nextjs` | Same as above |
| `@sentry/nextjs` | Inherits `@sentry/node` + `next` CVEs | 5.3 | Direct dependency | Same as above |
| `next` | Inherits `postcss` CVE | 6.1 | Direct dependency | Monitor Next.js releases |
| `next-auth` | Inherits `next` + `uuid` CVEs | 6.1 | Direct dependency | `next-auth` v5 migration |

> **Note on "fix available" markers:** `npm audit` reports fixes via major downgrade (e.g., `next 9.3.3`, `@sentry/nextjs 6.3.5`) which are not actionable. These vulnerabilities exist in transitive bundles with no patch released yet in the 16.x / 10.x branches. Monitor upstream for fixes.

#### LOW

| Package | Advisory | CVSS | Note |
|---|---|---|---|
| `@babel/core` | [GHSA-4x5r-pxfx-6jf8](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8) — Arbitrary file read via `sourceMappingURL` comment | 3.2 | Transitive dev-adjacent dep; fix available via `npm audit fix` |

---

### Outdated Packages

#### Major version bump — breaking-change risk

| Package | Installed | Latest | Risk |
|---|---|---|---|
| `@octokit/rest` | 21.1.1 | 22.0.1 | **Major** — review [v22 changelog](https://github.com/octokit/rest.js/releases) for breaking API changes before upgrading; package.json range `^21.0.0` prevents auto-install |

#### Minor/pre-release bumps — batch in next sweep

| Package | Installed | Latest | Note |
|---|---|---|---|
| `@anthropic-ai/sdk` | 0.96.0 | 0.106.0 | 10 minor bumps in `0.x` range — each minor can be semver-breaking; review SDK changelog before upgrading; range `^0.96.0` blocks auto-install |
| `googleapis` | 171.4.0 | 173.0.0 | Minor version jump within same major; low risk |

#### Patch bumps — low priority

| Package | Installed | Latest | Note |
|---|---|---|---|
| `next` | 16.2.6 | 16.2.9 | Patch — pinned without `^`; bump manually in `package.json` |
| `react` | 19.2.4 | 19.2.7 | Patch — pinned without `^`; bump manually |
| `react-dom` | 19.2.4 | 19.2.7 | Patch — pinned without `^`; bump manually |

---

### Recommended Actions

1. **Run `npm audit fix`** — resolves the `qs` and `@babel/core` advisories without breaking changes.
2. **Bump pinned packages** (`next`, `react`, `react-dom`) to their latest patch versions — edit `package.json` manually since they are pinned without a range specifier.
3. **Review `@octokit/rest` v22 changelog** before upgrading — major version; breaking API changes likely.
4. **Review `@anthropic-ai/sdk` changelog** for 0.96 → 0.106 — 0.x minor bumps may include breaking changes; test streaming and tool-use flows after upgrade.
5. **Monitor upstream** for `@sentry/nextjs` + `next` fixes to the OpenTelemetry and postcss advisory chains — no in-range patches exist today.
6. **Evaluate `next-auth` v5 migration** when capacity allows — resolves the `uuid` advisory and brings auth to the actively maintained major.

