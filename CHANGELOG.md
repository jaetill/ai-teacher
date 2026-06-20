# Changelog

## 1.0.0 (2026-06-20)


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

* **a11y:** gate return-focus on hasBeenOpenRef to prevent focus theft on mount (closes [#73](https://github.com/jaetill/ai-teacher/issues/73)) ([#74](https://github.com/jaetill/ai-teacher/issues/74)) ([da60883](https://github.com/jaetill/ai-teacher/commit/da60883786ef24a0192cadc32d99c9e0f1df8dfa))
* **a11y:** make feedback dialog keyboard-accessible (WCAG 2.1 SC 2.1.2) ([#71](https://github.com/jaetill/ai-teacher/issues/71)) ([cd15ce6](https://github.com/jaetill/ai-teacher/commit/cd15ce6c5e28a3a85acb32bf75d3632bb8eb00fd))
* **auth:** add session guard to link-materials route to prevent unauthenticated Anthropic API calls ([#103](https://github.com/jaetill/ai-teacher/issues/103)) ([b249304](https://github.com/jaetill/ai-teacher/commit/b2493046172acc7393ae7088980d1684a73f5f22)), closes [#88](https://github.com/jaetill/ai-teacher/issues/88)
* **ci:** clarify issues:write absence and pin dep-watch reusable to SHA (closes [#292](https://github.com/jaetill/ai-teacher/issues/292), closes [#291](https://github.com/jaetill/ai-teacher/issues/291)) ([#293](https://github.com/jaetill/ai-teacher/issues/293)) ([736782e](https://github.com/jaetill/ai-teacher/commit/736782e34a539d6fc0d8a3a3af1f5045952a51ce))
* **ci:** guard npm ci --prefix lambda for lambda-less repos ([#63](https://github.com/jaetill/ai-teacher/issues/63)) ([30684b9](https://github.com/jaetill/ai-teacher/commit/30684b97da20f583194953f024c8c8fd740de0a8))
* **ci:** hoist NB comment out of if-block scalar (workflow was unparseable) ([#43](https://github.com/jaetill/ai-teacher/issues/43)) ([4c6fa9b](https://github.com/jaetill/ai-teacher/commit/4c6fa9bf33e98edf8ec7929e0fadb25d4da1fef4))
* **ci:** scope reusable secrets explicitly (ADR-0048) ([#288](https://github.com/jaetill/ai-teacher/issues/288)) ([940d7aa](https://github.com/jaetill/ai-teacher/commit/940d7aa7bcf93af6cdc9cf61258a1a7ffef53f27))
* **feedback:** remove Source IP from GitHub issue body ([#50](https://github.com/jaetill/ai-teacher/issues/50)) ([#69](https://github.com/jaetill/ai-teacher/issues/69)) ([66c8cb3](https://github.com/jaetill/ai-teacher/commit/66c8cb3c2abfd322a0a412cede7e19194a6b2aa5))
* **feedback:** resolve set-state-in-effect lint error blocking CI ([#62](https://github.com/jaetill/ai-teacher/issues/62)) ([4ddab70](https://github.com/jaetill/ai-teacher/commit/4ddab70c02014610f51efea6dd92b44845f9e815))
* **implementer:** allow fleet-App dispatch; drop API-key fallback ([#59](https://github.com/jaetill/ai-teacher/issues/59)) ([452b987](https://github.com/jaetill/ai-teacher/commit/452b9870e44afeaa3fbcc5d66cf4bc93a4d82637))
* **import:** replace TOCTOU course find-or-create with onConflictDoNothing upsert ([#260](https://github.com/jaetill/ai-teacher/issues/260)) ([9cd0517](https://github.com/jaetill/ai-teacher/commit/9cd0517530e5c160cbb8e02623568c7c6cda5693)), closes [#239](https://github.com/jaetill/ai-teacher/issues/239)
* rename sentry.client.config.ts to instrumentation-client.ts ([4724fec](https://github.com/jaetill/ai-teacher/commit/4724fec56f67c58ca665a67bffe8e6f698de509b))
* **security:** add auth guard to GET /api/units/[id] (closes [#133](https://github.com/jaetill/ai-teacher/issues/133)) ([#150](https://github.com/jaetill/ai-teacher/issues/150)) ([569dec5](https://github.com/jaetill/ai-teacher/commit/569dec5d7b2983548fc8d1292a6b4713846a2a5d))
* **security:** add auth guard to POST /api/year-plan to block unauthenticated Anthropic calls ([#125](https://github.com/jaetill/ai-teacher/issues/125)) ([f887927](https://github.com/jaetill/ai-teacher/commit/f8879270d7b14741b1cedd3ceb4b56de924a49f2)), closes [#111](https://github.com/jaetill/ai-teacher/issues/111)
* **security:** assert course ownership on all 6 editor write endpoints (closes [#244](https://github.com/jaetill/ai-teacher/issues/244)) ([#275](https://github.com/jaetill/ai-teacher/issues/275)) ([e889311](https://github.com/jaetill/ai-teacher/commit/e889311877eb3a94996a230c95f2128d0c418cb7))
* **security:** close IDOR on GET /api/curriculum/editor/data (closes [#232](https://github.com/jaetill/ai-teacher/issues/232)) ([#242](https://github.com/jaetill/ai-teacher/issues/242)) ([f18ad8e](https://github.com/jaetill/ai-teacher/commit/f18ad8ebd4650c508894ae5fde300385f1180ffa))
* **security:** gate /api/curriculum/save behind session auth (closes [#91](https://github.com/jaetill/ai-teacher/issues/91)) ([#101](https://github.com/jaetill/ai-teacher/issues/101)) ([59ff248](https://github.com/jaetill/ai-teacher/commit/59ff2481776813df228c80cc84554dc64c579a79))
* **security:** gate /api/import/build-curriculum behind NextAuth session ([#105](https://github.com/jaetill/ai-teacher/issues/105)) ([b9d731c](https://github.com/jaetill/ai-teacher/commit/b9d731c01a083ac53bcf1d12c15ac3e4e5e270c5)), closes [#85](https://github.com/jaetill/ai-teacher/issues/85)
* **security:** gate AI API routes behind NextAuth session (closes [#7](https://github.com/jaetill/ai-teacher/issues/7)) ([#241](https://github.com/jaetill/ai-teacher/issues/241)) ([2c83abb](https://github.com/jaetill/ai-teacher/commit/2c83abbfb116e82aca0a541818bb05bec01f01e4))
* **security:** gate curriculum editor write endpoints behind session auth (closes [#237](https://github.com/jaetill/ai-teacher/issues/237)) ([#240](https://github.com/jaetill/ai-teacher/issues/240)) ([60ff186](https://github.com/jaetill/ai-teacher/commit/60ff18608a25217436e4b4432e91bbe83276acc5))
* **security:** gate GET /api/courses behind session auth (closes [#213](https://github.com/jaetill/ai-teacher/issues/213)) ([#217](https://github.com/jaetill/ai-teacher/issues/217)) ([4179c24](https://github.com/jaetill/ai-teacher/commit/4179c248e9d0fa9078aa7b8ee5edfade7a3930b1))
* **security:** null-safe ownership check on POST /api/copilot (closes [#269](https://github.com/jaetill/ai-teacher/issues/269)) ([#273](https://github.com/jaetill/ai-teacher/issues/273)) ([20c1fd3](https://github.com/jaetill/ai-teacher/commit/20c1fd3ca62ff79f58b591b304037d4402e9cfba))
* **security:** post-query null-safe ownership guard on GET /api/curriculum/editor/data (closes [#263](https://github.com/jaetill/ai-teacher/issues/263)) ([#297](https://github.com/jaetill/ai-teacher/issues/297)) ([99907cc](https://github.com/jaetill/ai-teacher/commit/99907cc2bdbe712ba152c8e20ebbb562046f981e))
* **security:** remove email from public GitHub issue body (closes [#49](https://github.com/jaetill/ai-teacher/issues/49)) ([#82](https://github.com/jaetill/ai-teacher/issues/82)) ([54dcf21](https://github.com/jaetill/ai-teacher/commit/54dcf21f1fe65cc5606a0fbeb7e455d554382ed2))
* **security:** scope reorder-lessons update to unitId to prevent IDOR (closes [#279](https://github.com/jaetill/ai-teacher/issues/279)) ([#295](https://github.com/jaetill/ai-teacher/issues/295)) ([aa33961](https://github.com/jaetill/ai-teacher/commit/aa339617e09393ad900f47d935612b5e01aaef73))
* **security:** scrub email addresses from exception values in edge Sentry config ([#81](https://github.com/jaetill/ai-teacher/issues/81)) ([0078267](https://github.com/jaetill/ai-teacher/commit/007826799846eacc3901ca2dcd747c6c38ea7c0c))
* **security:** scrub email addresses from exception values in server Sentry config ([#79](https://github.com/jaetill/ai-teacher/issues/79)) ([76a6858](https://github.com/jaetill/ai-teacher/commit/76a685870da33bdf69506aea10b0c21789bb74ce))
* **security:** scrub event.request PII in edge Sentry config (closes [#23](https://github.com/jaetill/ai-teacher/issues/23)) ([#173](https://github.com/jaetill/ai-teacher/issues/173)) ([71c46bb](https://github.com/jaetill/ai-teacher/commit/71c46bb4f91a0ef42069b5f2570a84bf65562bd6))
* **security:** validate courseId is a UUID before hitting the DB (closes [#258](https://github.com/jaetill/ai-teacher/issues/258)) ([#265](https://github.com/jaetill/ai-teacher/issues/265)) ([e0536a3](https://github.com/jaetill/ai-teacher/commit/e0536a30397f6e33ef8c24dcea04ae29d897ebaf))
* **sentry:** close PII gaps in edge and server beforeSend hooks ([23e9542](https://github.com/jaetill/ai-teacher/commit/23e95422f6da374956a34c9668b779cc49edbc94))
* **sentry:** harden breadcrumb scrubber against both Event shapes ([6ed23cc](https://github.com/jaetill/ai-teacher/commit/6ed23cc93a2e2870dd9f650d9d612268bdf2e95f))
* **sentry:** redactDeep now recurses into array elements to catch emails in arrays of objects ([#194](https://github.com/jaetill/ai-teacher/issues/194)) ([cdf44e9](https://github.com/jaetill/ai-teacher/commit/cdf44e9267df204b73c2b50f6a981452352bb79e)), closes [#185](https://github.com/jaetill/ai-teacher/issues/185)
* **sentry:** replace shallow redactStringFields with recursive redactDeep ([#182](https://github.com/jaetill/ai-teacher/issues/182)) ([8dc6fe6](https://github.com/jaetill/ai-teacher/commit/8dc6fe6feab1775a90963c27a165e999f949863a))
* **sentry:** scrub event.request, ui.input data.value, and edge breadcrumbs ([22b3dcc](https://github.com/jaetill/ai-teacher/commit/22b3dccb7f390b217648250b66c8b02e76073706))
* **types:** augment User.id on the User interface, not inline on Session ([#199](https://github.com/jaetill/ai-teacher/issues/199)) ([4875e59](https://github.com/jaetill/ai-teacher/commit/4875e591897ce7a5cc43031c5c57c48217aa3ba8)), closes [#198](https://github.com/jaetill/ai-teacher/issues/198)
