# Changelog

## 1.0.0 (2026-05-31)


### Features

* **.claude:** migrate to ai-team plugin subscription (ADR-0015) ([3fca8a9](https://github.com/jaetill/ai-teacher/commit/3fca8a9ef77da46aab1c3f07d876f03c3eec2d84))
* **.claude:** subscribe to agentic-dev-environment plugin ([942b3cc](https://github.com/jaetill/ai-teacher/commit/942b3ccabdff108484d757b6c2785c16887d09fe))
* adopt Agentic Dev Environment platform — Phases 1+2 ([#1](https://github.com/jaetill/ai-teacher/issues/1)) ([15405eb](https://github.com/jaetill/ai-teacher/commit/15405ebf659e581b8d6e6fa01b1808136bc7d259))
* adopt Agentic Dev Environment platform — Phases 3+4 (quality gates + CI) ([#3](https://github.com/jaetill/ai-teacher/issues/3)) ([7adf1c4](https://github.com/jaetill/ai-teacher/commit/7adf1c41bff61a98bc8a37e42d8b164fda093ad3))
* **ci:** migrate claude-pr-review to platform reusable (ADR-0018) ([4549062](https://github.com/jaetill/ai-teacher/commit/45490627f9ec706a3b25711b26a6df1ebb554506))
* phase 5 sentry observability via @sentry/nextjs ([8593400](https://github.com/jaetill/ai-teacher/commit/8593400bb064645eca1ac5c8981b5eeaa2643e7c))
* phase 5 sentry observability via @sentry/nextjs ([5a6243f](https://github.com/jaetill/ai-teacher/commit/5a6243fdf58ab0124ed38594ba152f50224c3981))
* Phase 7 - user feedback widget (Next.js) ([#46](https://github.com/jaetill/ai-teacher/issues/46)) ([d866844](https://github.com/jaetill/ai-teacher/commit/d8668441ca92ab92d41cb434b953608d75b30c20))


### Bug Fixes

* **ci:** guard npm ci --prefix lambda for lambda-less repos ([#63](https://github.com/jaetill/ai-teacher/issues/63)) ([30684b9](https://github.com/jaetill/ai-teacher/commit/30684b97da20f583194953f024c8c8fd740de0a8))
* **ci:** hoist NB comment out of if-block scalar (workflow was unparseable) ([#43](https://github.com/jaetill/ai-teacher/issues/43)) ([4c6fa9b](https://github.com/jaetill/ai-teacher/commit/4c6fa9bf33e98edf8ec7929e0fadb25d4da1fef4))
* **feedback:** resolve set-state-in-effect lint error blocking CI ([#62](https://github.com/jaetill/ai-teacher/issues/62)) ([4ddab70](https://github.com/jaetill/ai-teacher/commit/4ddab70c02014610f51efea6dd92b44845f9e815))
* **implementer:** allow fleet-App dispatch; drop API-key fallback ([#59](https://github.com/jaetill/ai-teacher/issues/59)) ([452b987](https://github.com/jaetill/ai-teacher/commit/452b9870e44afeaa3fbcc5d66cf4bc93a4d82637))
* rename sentry.client.config.ts to instrumentation-client.ts ([4724fec](https://github.com/jaetill/ai-teacher/commit/4724fec56f67c58ca665a67bffe8e6f698de509b))
* **sentry:** close PII gaps in edge and server beforeSend hooks ([23e9542](https://github.com/jaetill/ai-teacher/commit/23e95422f6da374956a34c9668b779cc49edbc94))
* **sentry:** harden breadcrumb scrubber against both Event shapes ([6ed23cc](https://github.com/jaetill/ai-teacher/commit/6ed23cc93a2e2870dd9f650d9d612268bdf2e95f))
* **sentry:** scrub event.request, ui.input data.value, and edge breadcrumbs ([22b3dcc](https://github.com/jaetill/ai-teacher/commit/22b3dccb7f390b217648250b66c8b02e76073706))
