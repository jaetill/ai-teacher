# Changelog

## [1.3.0](https://github.com/jaetill/ai-teacher/compare/v1.2.0...v1.3.0) (2026-08-19)


### Features

* **auth:** session-expired banner instead of silent Drive failures ([#653](https://github.com/jaetill/ai-teacher/issues/653)) ([79a9667](https://github.com/jaetill/ai-teacher/commit/79a9667b7dc085efcd226302b1216c5def365894))
* **calendar:** literal lesson calendar with derived dates and snow-day bumping ([#665](https://github.com/jaetill/ai-teacher/issues/665)) ([72f33dd](https://github.com/jaetill/ai-teacher/commit/72f33dd922a9b07805a8ec8f3433879a90a98e55))
* **calendar:** objectives + material links on lesson cards; fix feedback modal contrast ([#670](https://github.com/jaetill/ai-teacher/issues/670)) ([806ea69](https://github.com/jaetill/ai-teacher/commit/806ea69cca7164348ce2f6e88a2b7bb78c0fa7fa))
* **calendar:** per-section meeting days, editable from the sections panel ([#676](https://github.com/jaetill/ai-teacher/issues/676)) ([faea040](https://github.com/jaetill/ai-teacher/commit/faea040eb8f84c00a868375cbe7c657e196cc81e))
* **calendar:** school-year dates set once, not per course ([#672](https://github.com/jaetill/ai-teacher/issues/672)) ([e3cdbda](https://github.com/jaetill/ai-teacher/commit/e3cdbda1920fbaa59881e93b8d6c20ccba6cdb04))
* **calendar:** section checkbox sidebar; Atlas-style card headers ([#674](https://github.com/jaetill/ai-teacher/issues/674)) ([c2e31d6](https://github.com/jaetill/ai-teacher/commit/c2e31d63fada4569a816ab0a1d7f21c436665e20))
* **calendar:** sections as calendar rows + fork-a-year course clone ([#667](https://github.com/jaetill/ai-teacher/issues/667)) ([6db89ea](https://github.com/jaetill/ai-teacher/commit/6db89ea98f2bf9345f24473002c255a1463d10f7))
* **copilot:** draft blocks with explicit Accept & Create into Drive ([#626](https://github.com/jaetill/ai-teacher/issues/626)) ([a675622](https://github.com/jaetill/ai-teacher/commit/a675622f76ecbe0e31f2a3990ae1144e2798068b))
* **copilot:** page-aware context + materials in curriculum grounding ([#640](https://github.com/jaetill/ai-teacher/issues/640)) ([64783ed](https://github.com/jaetill/ai-teacher/commit/64783edf4cfd66e86d7e115617aa18538277abb3))
* **curriculum:** lessons-by-week prototype view + two glossary terms ([#664](https://github.com/jaetill/ai-teacher/issues/664)) ([54fb257](https://github.com/jaetill/ai-teacher/commit/54fb257d157dfca53f05663d142978f7b04c7196))
* **curriculum:** quarter browse view + edit-in-place from quarter and unit ([#635](https://github.com/jaetill/ai-teacher/issues/635)) ([aff9bf3](https://github.com/jaetill/ai-teacher/commit/aff9bf3a1216d45f43a745034fa1b839b8325ac0))
* **curriculum:** year-scoped home page with school-year switcher ([#633](https://github.com/jaetill/ai-teacher/issues/633)) ([#634](https://github.com/jaetill/ai-teacher/issues/634)) ([a8ee5b6](https://github.com/jaetill/ai-teacher/commit/a8ee5b60fa13a10450283d134f2721f932d48107))
* **editor:** drag a material straight from one lesson to another ([#596](https://github.com/jaetill/ai-teacher/issues/596)) ([b94bd4e](https://github.com/jaetill/ai-teacher/commit/b94bd4e2c7300824c21541476f11781c4283b90a))
* **editor:** quarter picker on the unit header ([#629](https://github.com/jaetill/ai-teacher/issues/629)) ([1379924](https://github.com/jaetill/ai-teacher/commit/1379924780ec5bcdf58e7dfcbac7323d4a8cbebe))
* **glossary:** editable glossary tab as a vocabulary-alignment instrument ([#638](https://github.com/jaetill/ai-teacher/issues/638)) ([f0fc7cb](https://github.com/jaetill/ai-teacher/commit/f0fc7cb84924d30846ad5571fbcf785482c6a8b8))
* **import:** add a Summer (summer reading) bucket alongside the quarters ([#592](https://github.com/jaetill/ai-teacher/issues/592)) ([01ae796](https://github.com/jaetill/ai-teacher/commit/01ae796743844af1f4ddb6ada50dd9cd7ef00687))
* **import:** graduate built quarters off the import screen ([#661](https://github.com/jaetill/ai-teacher/issues/661)) ([58c9f5c](https://github.com/jaetill/ai-teacher/commit/58c9f5c9ea5eebc4265818527cce7f51f96388f1))
* **import:** import a year plan and use it as a standing build reference ([#680](https://github.com/jaetill/ai-teacher/issues/680)) ([8d75bfe](https://github.com/jaetill/ai-teacher/commit/8d75bfe01c2f7fa13399e1cdbd02365cc6fd3f27))
* **import:** make Build idempotent - no more duplicate units on re-run ([#597](https://github.com/jaetill/ai-teacher/issues/597)) ([33b1ea4](https://github.com/jaetill/ai-teacher/commit/33b1ea4db917703810e3578162ad6ed3e63e0393))
* **import:** repair mode for backfill-units ([#686](https://github.com/jaetill/ai-teacher/issues/686)) ([ad3a5b3](https://github.com/jaetill/ai-teacher/commit/ad3a5b3b9dece8ab31b6efe1148778d94db1efb6))
* **items:** write questions from a passage, grounded by construction ([#679](https://github.com/jaetill/ai-teacher/issues/679)) ([799dd88](https://github.com/jaetill/ai-teacher/commit/799dd884c8e234be3622a1fa6386c6dc0557665b))
* **materials:** auto-summarize fresh imports ([#654](https://github.com/jaetill/ai-teacher/issues/654)) ([9114aa0](https://github.com/jaetill/ai-teacher/commit/9114aa0f74cb3a26f1918928e51d908867cdc464))
* **materials:** teacher-triggered AI summaries feeding copilot grounding ([#641](https://github.com/jaetill/ai-teacher/issues/641)) ([80a834f](https://github.com/jaetill/ai-teacher/commit/80a834f00ac3e18309e13810607e0628a45c1403))
* **nav:** calendar tab + contextual exit from edit mode ([#666](https://github.com/jaetill/ai-teacher/issues/666)) ([41fa437](https://github.com/jaetill/ai-teacher/commit/41fa437e990f591aa91cc8914026283bbaa57694))
* **nav:** grey out unfinished Differentiation and Communications tabs ([#673](https://github.com/jaetill/ai-teacher/issues/673)) ([af5aefb](https://github.com/jaetill/ai-teacher/commit/af5aefb73ef55f07512f3aa2adcb3ac249681332))
* read-only batch — standards coverage, vertical alignment, search, sub plans ([#637](https://github.com/jaetill/ai-teacher/issues/637)) ([36c9382](https://github.com/jaetill/ai-teacher/commit/36c9382d4cce8330b75d3c2c1b4dc290650039c2))
* **templates:** teacher-defined lesson templates, derived from her own lessons ([#677](https://github.com/jaetill/ai-teacher/issues/677)) ([d4cde33](https://github.com/jaetill/ai-teacher/commit/d4cde33a9c882524164c1e1fd25d764c7ba898cc))


### Bug Fixes

* **build:** stream the AI enrichment so large quarters don't truncate ([#591](https://github.com/jaetill/ai-teacher/issues/591)) ([a3a9d6a](https://github.com/jaetill/ai-teacher/commit/a3a9d6ace87233629e554e452533da6f78daa3dc))
* **calendar:** equal-width day columns in the all-sections week view ([#671](https://github.com/jaetill/ai-teacher/issues/671)) ([8975026](https://github.com/jaetill/ai-teacher/commit/8975026fb6c18483ca1ba645bb6f3f746e2006fc))
* **curriculum:** unit week grouping matches the stated duration ([#628](https://github.com/jaetill/ai-teacher/issues/628)) ([058573a](https://github.com/jaetill/ai-teacher/commit/058573a4a251d3b37c31c38db61c1d143ca22b8b))
* **deps:** clear all 8 high-severity audit findings; record the units rule ([#685](https://github.com/jaetill/ai-teacher/issues/685)) ([d3efd84](https://github.com/jaetill/ai-teacher/commit/d3efd84910a6c99420d66fda84b0523f61c6fd27))
* **editor:** edit unit summary in a full-width textarea, not a tiny input ([#594](https://github.com/jaetill/ai-teacher/issues/594)) ([0fdc37a](https://github.com/jaetill/ai-teacher/commit/0fdc37a0c09e085ac26b511a3a1df70ff51fe479))
* **editor:** pool shows all imported materials, filterable by type and unit ([#589](https://github.com/jaetill/ai-teacher/issues/589)) ([9c329bb](https://github.com/jaetill/ai-teacher/commit/9c329bbbeecb42fe7ae1f65d7471743b74e93bb5))
* **editor:** quarter picker moves the unit into its quarter; readable options ([#630](https://github.com/jaetill/ai-teacher/issues/630)) ([a38d22b](https://github.com/jaetill/ai-teacher/commit/a38d22b5c9d90ba7feaeddd36e913cdc26bda1f6))
* **editor:** show lesson position, not raw sortOrder, in the number badge ([#598](https://github.com/jaetill/ai-teacher/issues/598)) ([7c5d8ed](https://github.com/jaetill/ai-teacher/commit/7c5d8ed87a3839f8c3a53172dff36dba19a57c47))
* **editor:** update-item passed snake_case keys to drizzle .set(); dropdown contrast ([#631](https://github.com/jaetill/ai-teacher/issues/631)) ([2919915](https://github.com/jaetill/ai-teacher/commit/29199158a257fd96812ce26771c8cd30396872ef))
* **import:** let a built quarter be rebuilt, and show material imported since ([#687](https://github.com/jaetill/ai-teacher/issues/687)) ([b6699fb](https://github.com/jaetill/ai-teacher/commit/b6699fb023941ef1dbe59aa80e11562a4a1f13a7))
* **import:** mark permanently-unexportable files; drop count from built cards ([#663](https://github.com/jaetill/ai-teacher/issues/663)) ([48429e3](https://github.com/jaetill/ai-teacher/commit/48429e3a3a26b4505f7ee445fc9a899919767bd5))
* **import:** surface root-level files instead of burying them in the scan ([#681](https://github.com/jaetill/ai-teacher/issues/681)) ([92cade7](https://github.com/jaetill/ai-teacher/commit/92cade7f3f745b5d2cb847b7aeaff2923f4d81bc))
* **import:** year plan must not override her units; nested folders must not become units ([#682](https://github.com/jaetill/ai-teacher/issues/682)) ([c6a9dcb](https://github.com/jaetill/ai-teacher/commit/c6a9dcbb27c5020e818034b1b3e88a495b2f2d99))
* **materials:** mark empty-extraction files instead of failing them forever ([#642](https://github.com/jaetill/ai-teacher/issues/642)) ([506df4f](https://github.com/jaetill/ai-teacher/commit/506df4f0d2f88bdc46c0c5ba4b52219e0d3a1c65))
* **materials:** summarize hardening — AI rate limit, prompt-safe titles, rate_limits cleanup ([#652](https://github.com/jaetill/ai-teacher/issues/652)) ([d191d02](https://github.com/jaetill/ai-teacher/commit/d191d025b1ae3b7f3a4b6520dcde755b9abaad02))
* **security:** materials.owner_email — column, stamped inserts, index ([#655](https://github.com/jaetill/ai-teacher/issues/655)) ([790a4da](https://github.com/jaetill/ai-teacher/commit/790a4dadfbea268e0356962f44613a7093ee1f3b))
* **security:** scope materials reads by owner; validate ids and enums ([#658](https://github.com/jaetill/ai-teacher/issues/658)) ([e0b3324](https://github.com/jaetill/ai-teacher/commit/e0b332412aa2af5abb4548d80aa56cb4d10b4823))
* **ui:** theme-aware native select popups via color-scheme + global option colors ([#632](https://github.com/jaetill/ai-teacher/issues/632)) ([f0db10f](https://github.com/jaetill/ai-teacher/commit/f0db10f471eb01ff9ddbbf9bf507b5fe42294cc7))


### Performance Improvements

* **build:** batch lesson/standard/attachment inserts per unit ([#659](https://github.com/jaetill/ai-teacher/issues/659)) ([c227960](https://github.com/jaetill/ai-teacher/commit/c227960f4226fe7cf0dbaeccae2f3d05aeff9a91))


### Reverts

* **curriculum:** drop duplicate copy-to-year button and clone route ([#668](https://github.com/jaetill/ai-teacher/issues/668)) ([e227ac4](https://github.com/jaetill/ai-teacher/commit/e227ac400099b85772f587f31c047a5583207626))

## [1.2.0](https://github.com/jaetill/ai-teacher/compare/v1.1.0...v1.2.0) (2026-07-28)


### Features

* **build:** build units from the teacher's folders + reference input ([#587](https://github.com/jaetill/ai-teacher/issues/587)) ([eec66ac](https://github.com/jaetill/ai-teacher/commit/eec66ac417ee525a5a1347dea69a9b608af8bd35))
* **build:** generate multiple units per quarter ([#579](https://github.com/jaetill/ai-teacher/issues/579)) ([1cf756f](https://github.com/jaetill/ai-teacher/commit/1cf756f8b69362cc9a2423f378293b37eff8dc87))
* **curriculum:** edit title and delete a curriculum from the editor ([#571](https://github.com/jaetill/ai-teacher/issues/571)) ([104dc09](https://github.com/jaetill/ai-teacher/commit/104dc09f865d931b8470d70869452f2c79551de5))
* **curriculum:** editable titles for import + move import into the year-plan form ([#570](https://github.com/jaetill/ai-teacher/issues/570)) ([6cdf6b9](https://github.com/jaetill/ai-teacher/commit/6cdf6b9f61433436d36c1d42369d3f0970297a20))
* **curriculum:** import a previous year as a baseline for a new year ([#569](https://github.com/jaetill/ai-teacher/issues/569)) ([2c86a3d](https://github.com/jaetill/ai-teacher/commit/2c86a3dfda56a5dca71042bd6f2f025be4a8ecc9))
* **editor:** add/remove units and lessons, edit summary and durations ([#588](https://github.com/jaetill/ai-teacher/issues/588)) ([6009c16](https://github.com/jaetill/ai-teacher/commit/6009c166a23a7c47e7d9e77b77aa6af773e6ba8c))
* **import:** build a quarter directly from the imported-materials panel ([#580](https://github.com/jaetill/ai-teacher/issues/580)) ([563b36b](https://github.com/jaetill/ai-teacher/commit/563b36b82e3980ad414094c1112cc2efdc38cc0e))
* **import:** capture the teacher's unit folders at import ([#585](https://github.com/jaetill/ai-teacher/issues/585)) ([83026c5](https://github.com/jaetill/ai-teacher/commit/83026c54204cee4df5755040e638ac936c1252bf))
* **import:** non-destructive retrofit of existing imports ([#586](https://github.com/jaetill/ai-teacher/issues/586)) ([744f377](https://github.com/jaetill/ai-teacher/commit/744f3776c8443592907019dfdc4e739a6f8b5548))
* **import:** show imported materials by quarter on the Import page ([#578](https://github.com/jaetill/ai-teacher/issues/578)) ([4880f0e](https://github.com/jaetill/ai-teacher/commit/4880f0e0f684f16e137713a20d957d6a74734bde))


### Bug Fixes

* **ai:** replace retired claude-sonnet-4-20250514 model ([#575](https://github.com/jaetill/ai-teacher/issues/575)) ([ba55b78](https://github.com/jaetill/ai-teacher/commit/ba55b78ce9cbef6e1504f60a57d99d698edf72d8))
* apply migrations over neon-http (websocket migrate silently no-ops) ([dc5dedf](https://github.com/jaetill/ai-teacher/commit/dc5dedf6950e44a74992ddbb552a93d134504d5f))
* **build:** lower max_tokens to 16384 to avoid SDK non-streaming guard ([#581](https://github.com/jaetill/ai-teacher/issues/581)) ([3842c9a](https://github.com/jaetill/ai-teacher/commit/3842c9a1af2049a6ca2fd14a11f70205acd9e9f2))
* **build:** raise timeout and size units by scope to avoid 504 ([#582](https://github.com/jaetill/ai-teacher/issues/582)) ([635bf0a](https://github.com/jaetill/ai-teacher/commit/635bf0a3b0080e0633ec39b2054377a232023244))
* **build:** tolerate markdown-fenced JSON in AI response ([#584](https://github.com/jaetill/ai-teacher/issues/584)) ([72f82de](https://github.com/jaetill/ai-teacher/commit/72f82de233296716e6857c2b9b01c56a86cad77e))
* **ci:** release caller uses secrets: inherit + rides [@main](https://github.com/main) (closes [#64](https://github.com/jaetill/ai-teacher/issues/64)) ([#548](https://github.com/jaetill/ai-teacher/issues/548)) ([35e0b02](https://github.com/jaetill/ai-teacher/commit/35e0b027264b59d600aa69c36edae5ce4dfab598))
* **curriculum:** make editor title rename tappable on touch devices ([#573](https://github.com/jaetill/ai-teacher/issues/573)) ([05d4f91](https://github.com/jaetill/ai-teacher/commit/05d4f9177dd100dad6642882c03a5f085486a30e))
* **drive/import:** align early-exit folder error format with catch-block sanitization ([#567](https://github.com/jaetill/ai-teacher/issues/567)) ([c0db4da](https://github.com/jaetill/ai-teacher/commit/c0db4da55c79c005d92355ad1577de119b17f409))
* **drive/import:** sanitize per-file Drive error messages in POST handler ([#560](https://github.com/jaetill/ai-teacher/issues/560)) ([dfd78be](https://github.com/jaetill/ai-teacher/commit/dfd78be416f588acce162d3a734acd09a3adaa73)), closes [#555](https://github.com/jaetill/ai-teacher/issues/555)
* full-eval remediation across API, client, and migrations ([0f8be6a](https://github.com/jaetill/ai-teacher/commit/0f8be6aac115963ab7ed6e8064390854d0d7b6bc))
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
