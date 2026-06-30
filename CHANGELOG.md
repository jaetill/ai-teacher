# Changelog

## [1.1.1](https://github.com/jaetill/ai-teacher/compare/v1.1.0...v1.1.1) (2026-06-30)


### Bug Fixes

* **ci:** release caller uses secrets: inherit + rides [@main](https://github.com/main) (closes [#64](https://github.com/jaetill/ai-teacher/issues/64)) ([#548](https://github.com/jaetill/ai-teacher/issues/548)) ([35e0b02](https://github.com/jaetill/ai-teacher/commit/35e0b027264b59d600aa69c36edae5ce4dfab598))
* **drive/import:** align early-exit folder error format with catch-block sanitization ([#567](https://github.com/jaetill/ai-teacher/issues/567)) ([c0db4da](https://github.com/jaetill/ai-teacher/commit/c0db4da55c79c005d92355ad1577de119b17f409))
* **drive/import:** sanitize per-file Drive error messages in POST handler ([#560](https://github.com/jaetill/ai-teacher/issues/560)) ([dfd78be](https://github.com/jaetill/ai-teacher/commit/dfd78be416f588acce162d3a734acd09a3adaa73)), closes [#555](https://github.com/jaetill/ai-teacher/issues/555)
* **year-plan/save:** batch all unit inserts atomically to prevent partial writes ([#114](https://github.com/jaetill/ai-teacher/issues/114)) ([#556](https://github.com/jaetill/ai-teacher/issues/556)) ([54d8da4](https://github.com/jaetill/ai-teacher/commit/54d8da422cd1d5190f8c24912d327f04968dab35))
* **year-plan/save:** scope course lookup and insert to schoolYear (closes [#113](https://github.com/jaetill/ai-teacher/issues/113)) ([#564](https://github.com/jaetill/ai-teacher/issues/564)) ([717d5d9](https://github.com/jaetill/ai-teacher/commit/717d5d9e3e229ce0066ee495d0043c4d7159677d))

## [1.1.0](https://github.com/jaetill/ai-teacher/compare/v1.0.2...v1.1.0) (2026-06-27)


### Features

* **ci-cd:** add Actions-driven Vercel prod deploy gated by GitHub Environment (closes [#124](https://github.com/jaetill/ai-teacher/issues/124)) ([#440](https://github.com/jaetill/ai-teacher/issues/440)) ([47d6018](https://github.com/jaetill/ai-teacher/commit/47d601834a94a24f0b3da0a2070ce2f546387a2a))


### Bug Fixes

* **api:** add input size caps to curriculum and year-plan routes (closes [#93](https://github.com/jaetill/ai-teacher/issues/93)) ([#466](https://github.com/jaetill/ai-teacher/issues/466)) ([68cef56](https://github.com/jaetill/ai-teacher/commit/68cef56c96551ef32caa30535c56824995a3496f))
* **authz:** add session guard to GET /api/curriculum/editor/pool (closes [#238](https://github.com/jaetill/ai-teacher/issues/238)) ([#409](https://github.com/jaetill/ai-teacher/issues/409)) ([1e17402](https://github.com/jaetill/ai-teacher/commit/1e17402fe28bc2149b4e51ec76fdc4b97e0941fa))
* **authz:** scope driveFolders query to exact grade+quarter keys (closes [#412](https://github.com/jaetill/ai-teacher/issues/412)) ([#424](https://github.com/jaetill/ai-teacher/issues/424)) ([77e6375](https://github.com/jaetill/ai-teacher/commit/77e63752a57ec1cc8c8cc7b197ba92d5eb517f07))
* **authz:** set ownerEmail on course INSERT in build-curriculum route (closes [#207](https://github.com/jaetill/ai-teacher/issues/207)) ([#414](https://github.com/jaetill/ai-teacher/issues/414)) ([71207a2](https://github.com/jaetill/ai-teacher/commit/71207a2d9f045f9c1b16e2c111734a649b904fd2))
* **authz:** set ownerEmail on course INSERT in year-plan/save (closes [#206](https://github.com/jaetill/ai-teacher/issues/206)) ([#415](https://github.com/jaetill/ai-teacher/issues/415)) ([2fd7191](https://github.com/jaetill/ai-teacher/commit/2fd7191663e29842da62814278abb6636b64d8ce))
* **ci:** add bot-guard to implementer run job; correct ADR-0020 notes (closes [#68](https://github.com/jaetill/ai-teacher/issues/68)) ([#464](https://github.com/jaetill/ai-teacher/issues/464)) ([e926342](https://github.com/jaetill/ai-teacher/commit/e9263423fcad96617d68496f3f84a5c393679c4c))
* **ci:** drop unused IMPLEMENTER_PAT forwarding from both implementer-caller jobs (refs [#363](https://github.com/jaetill/ai-teacher/issues/363)) ([#402](https://github.com/jaetill/ai-teacher/issues/402)) ([3c95d11](https://github.com/jaetill/ai-teacher/commit/3c95d112006a1a0c7554c4643dda27cc9cdfd3be))
* **ci:** guard permissions block against workflows:write addition (closes [#404](https://github.com/jaetill/ai-teacher/issues/404)) ([#436](https://github.com/jaetill/ai-teacher/issues/436)) ([0e72cc6](https://github.com/jaetill/ai-teacher/commit/0e72cc6c92880712f655e797ee4f9f3adba6c8c0))
* **ci:** replace caller with canonical thin caller - drop invalid 'workflows: write' (closes [#575](https://github.com/jaetill/ai-teacher/issues/575)) ([#403](https://github.com/jaetill/ai-teacher/issues/403)) ([e212948](https://github.com/jaetill/ai-teacher/commit/e21294876f667a9789e76ed75ed3d6ca8eccee36))
* **ci:** scope workflows:write to dispatch-only to cap prompt-injection blast radius (closes [#374](https://github.com/jaetill/ai-teacher/issues/374)) ([#396](https://github.com/jaetill/ai-teacher/issues/396)) ([975c67e](https://github.com/jaetill/ai-teacher/commit/975c67e47fc886b78a3499d8ba0ba95730cbfdaa))
* **communications:** cap input lengths to prevent quota exhaustion (closes [#251](https://github.com/jaetill/ai-teacher/issues/251)) ([#357](https://github.com/jaetill/ai-teacher/issues/357)) ([56fe3b9](https://github.com/jaetill/ai-teacher/commit/56fe3b92199621aca4d8039c967511ffb179a74e))
* **communications:** cap tone field at 50 chars to close quota-exhaustion gap (closes [#360](https://github.com/jaetill/ai-teacher/issues/360)) ([#375](https://github.com/jaetill/ai-teacher/issues/375)) ([1ee6c9c](https://github.com/jaetill/ai-teacher/commit/1ee6c9c066c0110833bf12ab698cefa7092afa59))
* **copilot:** cap input lengths to prevent quota exhaustion (closes [#356](https://github.com/jaetill/ai-teacher/issues/356)) ([#366](https://github.com/jaetill/ai-teacher/issues/366)) ([da0a78a](https://github.com/jaetill/ai-teacher/commit/da0a78a29d242a943988b706b9f2fd213f4f3e33))
* **curriculum:** upgrade model ID from claude-opus-4-6 to claude-opus-4-8 ([#435](https://github.com/jaetill/ai-teacher/issues/435)) ([39a678b](https://github.com/jaetill/ai-teacher/commit/39a678bfa9d3c2e4aa1fc3939ca090fe916abf6c)), closes [#425](https://github.com/jaetill/ai-teacher/issues/425)
* **differentiation:** cap input lengths to prevent quota exhaustion (closes [#250](https://github.com/jaetill/ai-teacher/issues/250)) ([#383](https://github.com/jaetill/ai-teacher/issues/383)) ([04f9813](https://github.com/jaetill/ai-teacher/commit/04f9813a041c3ae086facf43ad8c1eff77b74277))
* **editor:** guard intermediate DB lookups against null to prevent 500s ([#349](https://github.com/jaetill/ai-teacher/issues/349)) ([40cc8e8](https://github.com/jaetill/ai-teacher/commit/40cc8e8a1a729b55d4b0ecf2891e89626f0882e5)), closes [#277](https://github.com/jaetill/ai-teacher/issues/277)
* **editor:** wrap logEdit in try-catch in move-assessment (closes [#354](https://github.com/jaetill/ai-teacher/issues/354)) ([#368](https://github.com/jaetill/ai-teacher/issues/368)) ([76f3eee](https://github.com/jaetill/ai-teacher/commit/76f3eee6a2e8e0e9b49001176980d0761925d982))
* **editor:** wrap move-lesson sort-order writes in a db transaction ([#340](https://github.com/jaetill/ai-teacher/issues/340)) ([d217aef](https://github.com/jaetill/ai-teacher/commit/d217aef64563801aabd21401bd8f3fc543ef1764)), closes [#329](https://github.com/jaetill/ai-teacher/issues/329)
* **import:** stamp ownerEmail on course INSERT and add auth guard tests ([#418](https://github.com/jaetill/ai-teacher/issues/418)) ([16e8f24](https://github.com/jaetill/ai-teacher/commit/16e8f24b5e19d7bfb0c37f297e560bb69a150d23)), closes [#215](https://github.com/jaetill/ai-teacher/issues/215)
* **move-lesson:** log transaction error instead of swallowing it (closes [#341](https://github.com/jaetill/ai-teacher/issues/341)) ([#347](https://github.com/jaetill/ai-teacher/issues/347)) ([6f9a981](https://github.com/jaetill/ai-teacher/commit/6f9a981e0ed8e9fe91506ddfd37627e9e48503cb))
* **move-lesson:** make logEdit non-fatal so audit failure cannot cause a retry-driven double-move ([#348](https://github.com/jaetill/ai-teacher/issues/348)) ([04b03ec](https://github.com/jaetill/ai-teacher/commit/04b03ec26f5242356c829d9dd10edc4f634e3588)), closes [#342](https://github.com/jaetill/ai-teacher/issues/342)
* **retype-content:** wrap writes in a transaction to prevent orphaned rows (closes [#351](https://github.com/jaetill/ai-teacher/issues/351)) ([#397](https://github.com/jaetill/ai-teacher/issues/397)) ([5531342](https://github.com/jaetill/ai-teacher/commit/5531342b3ca3eee47b24472e5cc8f2a47c726757))
* **scripts:** add --dry-run and --confirm gates to backfill-owner-email ([#434](https://github.com/jaetill/ai-teacher/issues/434)) ([2a7be1d](https://github.com/jaetill/ai-teacher/commit/2a7be1dece6a6e530126b20fcc210da16104ebbc))
* **security:** add auth + course-ownership guard to POST /api/units/[id]/notes ([#463](https://github.com/jaetill/ai-teacher/issues/463)) ([551b60d](https://github.com/jaetill/ai-teacher/commit/551b60d5d2b64dd48fa4b0818a4e4b955f6df65a)), closes [#168](https://github.com/jaetill/ai-teacher/issues/168)
* **security:** auth + ownership guard on POST /api/lessons/[id]/notes ([#467](https://github.com/jaetill/ai-teacher/issues/467)) ([9ac444d](https://github.com/jaetill/ai-teacher/commit/9ac444db57b47e39f7ed1780366c4d7ad8cc7006))
* **security:** cap rawPlan input at 50k chars to prevent storage exhaustion (closes [#355](https://github.com/jaetill/ai-teacher/issues/355)) ([#365](https://github.com/jaetill/ai-teacher/issues/365)) ([28c9740](https://github.com/jaetill/ai-teacher/commit/28c974090b7e1ebeb40049e17353362e41526ebc))
* **security:** enforce strict ownerEmail on GET /api/units/[id] (closes [#204](https://github.com/jaetill/ai-teacher/issues/204)) ([#429](https://github.com/jaetill/ai-teacher/issues/429)) ([a297182](https://github.com/jaetill/ai-teacher/commit/a2971824123d2bc3b4eaadd5f33fd6ead6e409a3))
* **security:** merge unit+course lookup into single ownership-scoped JOIN (closes [#152](https://github.com/jaetill/ai-teacher/issues/152)) ([#468](https://github.com/jaetill/ai-teacher/issues/468)) ([005610d](https://github.com/jaetill/ai-teacher/commit/005610ddfc4162ebf1c7b23fd68b7b7194a054cc))
* **security:** scope GET /api/courses to authenticated owner + add IDOR tests (closes [#225](https://github.com/jaetill/ai-teacher/issues/225)) ([#419](https://github.com/jaetill/ai-teacher/issues/419)) ([f80a5c8](https://github.com/jaetill/ai-teacher/commit/f80a5c88d9c1e8d213d5513328eceb44dbdbfa03))
* **security:** validate ownerEmail before Anthropic call in build-curriculum ([#345](https://github.com/jaetill/ai-teacher/issues/345)) ([9eb975f](https://github.com/jaetill/ai-teacher/commit/9eb975f36c539f702532519184c82d3258b93ac9)), closes [#222](https://github.com/jaetill/ai-teacher/issues/222)
* **units:** populate userId on unit INSERTs so ownership check is enforced (closes [#323](https://github.com/jaetill/ai-teacher/issues/323)) ([#350](https://github.com/jaetill/ai-teacher/issues/350)) ([84a5b21](https://github.com/jaetill/ai-teacher/commit/84a5b21df5f439885d690afa5c3970a8c888d0e8))

## [1.0.2](https://github.com/jaetill/ai-teacher/compare/v1.0.1...v1.0.2) (2026-06-21)


### Bug Fixes

* **move-assessment:** log transaction error instead of swallowing it ([#338](https://github.com/jaetill/ai-teacher/issues/338)) ([f31f301](https://github.com/jaetill/ai-teacher/commit/f31f301aba5511f2f0cdcad9e5f81efac2e70046)), closes [#335](https://github.com/jaetill/ai-teacher/issues/335)
* **security:** validate UUID format on infer-standards path param (closes [#325](https://github.com/jaetill/ai-teacher/issues/325)) ([#339](https://github.com/jaetill/ai-teacher/issues/339)) ([393f0ed](https://github.com/jaetill/ai-teacher/commit/393f0edcdcc85a9e95777ddd0789015850a18d58))

## [1.0.1](https://github.com/jaetill/ai-teacher/compare/v1.0.0...v1.0.1) (2026-06-20)


### Bug Fixes

* **editor:** wrap move-assessment sort-order writes in a db transaction ([#334](https://github.com/jaetill/ai-teacher/issues/334)) ([30f7163](https://github.com/jaetill/ai-teacher/commit/30f71636de7386b10ee6a9c55c234ea50cbcf2d4)), closes [#310](https://github.com/jaetill/ai-teacher/issues/310)
* **security:** auth + ownership guard on infer-standards; pin null-bypass test (closes [#141](https://github.com/jaetill/ai-teacher/issues/141)) ([#321](https://github.com/jaetill/ai-teacher/issues/321)) ([f93189b](https://github.com/jaetill/ai-teacher/commit/f93189bdc80f6dc42170e7bba88f3acf8e52635a))
* **security:** auth + ownership on move-lesson + move-assessment (closes [#327](https://github.com/jaetill/ai-teacher/issues/327)) ([#328](https://github.com/jaetill/ai-teacher/issues/328)) ([12304ef](https://github.com/jaetill/ai-teacher/commit/12304efc20e40f4e3520bd0a0f5b84c7fedfa4a9))
* **security:** validate conversationId as UUID before DB query (closes [#271](https://github.com/jaetill/ai-teacher/issues/271)) ([#272](https://github.com/jaetill/ai-teacher/issues/272)) ([eaac241](https://github.com/jaetill/ai-teacher/commit/eaac2418bb056ac29c9424b5efedee23a58cfbdc))

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
