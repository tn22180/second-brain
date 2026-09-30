# BLOG security re-audit — 2026-09-30

Read-only (`git show`/`git grep`/`git log`/`git diff` only). No checkout, no writes.

**Refs collapsed to one:** `v1.85.8` == `origin/master` == `ae18fb047` (tagged today, 2026-09-30,
same commit as master HEAD). So "prod" and "master" are identical right now — every row below is
one verdict, not two.

**Base of our fix branch:** `d1c15544a` (2026-09-23), ancestor of `ae18fb047`. 64 commits landed
on master since then, our 17-commit `fix/security-high-2026-09` (HEAD `393c5f07c`) not among them
(branch was never pushed, confirmed: `git log d1c15544a..origin/master` — none of our SHAs appear).

## Counts

| Column | Count |
|---|---|
| Real findings re-checked (G1–G24 + review-found items) | 26 |
| Open (unfixed) at v1.85.8/master | 26 |
| Fixed independently by someone else | 0 |
| Partial | 0 |
| Already-fixed (FAL-759/757/dcdd6a27c) — re-verified still fixed | 7/7 |
| New 🔴 found in the 64-commit gap (same vuln classes) | 1 (G12 widened) |

**Bottom line: nothing got fixed while we waited.** All 26 real findings from the original audit
are still exploitable today, on the tag that's live right now. One of them (G12, dev-zone
internal-key scope) got measurably *worse* via an unrelated feature commit.

## blogGenerationClaims check (per your note)

Not an independent fix. `blogGenerationClaimRepository.js` and the `blogGenerationClaims`
Firestore collection **predate** `d1c15544a` — they exist for article-publish dedup
(`saveGeneratedArticle({shop, result, generationId})`), untouched by any of the 64 commits
(`git log d1c15544a..origin/master -- .../blogGenerationClaimRepository.js` → empty). G14 (client
picks the idempotency key that gates the token charge, full paid pipeline runs regardless) is
**still fully open** — confirmed by reading `langGraphController.js:generate` on master today:
`idempotencyKey: generationId` straight from body, `streamBlogWithLangGraph(...)` runs
unconditionally before that key is even used.

## Row-by-row (file:line at origin/master `ae18fb047`)

| Group | Verdict | file:line | Note |
|---|---|---|---|
| G1 npm token | 🔴 open | `.npmrc:1`, `.yarnrc.yml:6`, `packages/functions/.npmrc:1` | literal `registry.avada.io` token still committed, unrotated |
| G2 open rules | 🔴 open | `firestore.rules:4-6` (`articles`), `firebase.storage.rules:4-5` (`blog-media/{shopId}`) | unchanged, unconditional read+write |
| G3 debug leak | 🔴 open | `packages/assets/src/helpers/clientFetchSSE.js:~42`, `.../utils/debugHelper.js` | headers still spread into `requestInfo`, `sendDebugError` still no redaction |
| G4 OAuth popup | 🔴 open | `packages/functions/src/controllers/googleController.js:~117-131`, `assets/.../GoogleAnalyticsConfig.jsx:149-169` | `state` still bare `shopId`, `postMessage(..., "*")` still literal, `handleMessage` still has no `event.origin`/`event.source` check |
| G5 console.log shop | 🔴 open | `assets/src/pages/ContentManager/PostManagement/ManageTable/ModalImport.js:189` | `console.log('shop', shop)` verbatim (path has `ContentManager/` — the original finding's short path was ambiguous, confirmed via `git ls-tree`) |
| G6 isTeamAvada spoof | 🔴 open | `FeatureReq/featureReq.controller.js:createCommentFeatureReq` | `data?.isTeamAvada` still trusted straight from body, sets `shopOwner: 'Avada team'` |
| G7 blockUser delete | 🔴 open | `FeatureReq/featureReq.controller.js:blockUser` | `blockId` from body → `deleteFeatureReqsByShopId(blockId)`, still no ownership check |
| G8 secrets→BigQuery | 🔴 open | `commands/syncShopsToBigQuery.js:~33` (still substring-`token` blocklist, misses nested `googleAnalytics.serviceAccountKey`); `config/changelog.js` (still zero `pickKeys`/`transformRow` — ships whole doc) | `changelog.js` only changed by adding `memory: '512MiB'` (unrelated perf fix, commit `56361f0f4`, predates our base too) |
| G9 unscoped doc-id mutation | 🔴 open | `authorController.js:~199` (`remove`), `componentsController.js:~58` (`update`), `sidebarAdsController.js:~113,143` (`remove`/`updateActive`) | all four still take `id` from body/params with zero shop check |
| G10 blogAssist no shop | 🔴 open | `blogAssist.controller.js:getCompletions,getBlogAssistByBlogId` | still keyed by `blogId` alone |
| G11 competitors global | 🔴 open | `routes/api.js:296-298`, `competitorsController.js:add/remove` | still zero gate, no `requireDevZone` |
| G12 devzone redis unscoped | 🔴 **open, WORSENED** | `helpers/devZoneAccess.js:canInternalUseDevZone`, `controllers/devZoneController.js:~630-810` | see "New 🔴" below — internal-key blast radius got wider since d1c15544a |
| G13 genAIBlog historyId | 🔴 open | `genAIBlogController.js:generateBlog,reGenerateBlog` | still `getHistory(historyId)`/`updateHistoryGenAIBlog(historyId,...)`, no shop check |
| G14 langGraph idempotency | 🔴 open — **highest impact, confirmed live today** | `langGraphController.js:generate` | `idempotencyKey: generationId` (client-picked), paid pipeline runs unconditionally on every request regardless of replay |
| G15 settings `?domain=` | 🔴 open | `settingsController.js:getOne` (`~line 33-36`) | `/api/settings` (session router, `routes/api.js:229`) still shares the same handler as public `/proxy/settings`, still honors `?domain=` unconditionally |
| G16 settingsRepository shopId spread | 🔴 open | `repositories/settingsRepository.js:updateOrCreateByShopId` | `collection.add({shopId, ...data})` and `.doc(id).update(data)` unchanged — body `shopId` still wins |
| G17 ai-summary/blogs public | 🔴 open | `routes/proxy.js:49`, `settingsController.js:getBlogs` (~250) | still no `validatePlan`/rate-limit, sibling `voteAISummary` route still has them |
| G18 shop update blocklist | 🔴 open | `shopController.js:updateShop` (~129), `config/pickFields.js:86` | `blockFields = ['plan','isDevZone','installedAt','isLegacyPlan','pricingVersion']` unchanged, still a blocklist |
| — related, review-found | 🔴 open (bonus) | `shopController.js:updateShopByFieldNumber` (~166), `routes/api.js:64` | `POST /shop/field-number`: `field` from body → `FieldValue.increment(1)` on **any** field, e.g. `isLegacyPlan` — bypasses the G18 blocklist entirely. Pre-existed at `d1c15544a`, not newly introduced, but still live and still not covered by the original 60-row list |
| G19 getBlogCustomer body shopId | 🔴 open | `shopController.js:getBlogCustomer` (~321-330) | `{idBlog, shopId} = ctx.req.body`, still loads arbitrary shop by body `shopId` |
| G20 codegen hardcoded token | 🔴 open — **ROTATE, still not done** | `graphql/codegen.js:7` | `ACCESS_TOKEN = process.env.ACCESS_TOKEN \|\| 'shpua_ea8684a2aa4be9309b9933262e431dcb'` — same literal, unrotated |
| G21 prepareShop GA key leak | 🔴 open | `helpers/helpers.js:26` | untouched by any of the 64 commits; our fix was BLOCKED anyway (FE reads the key directly, `Analytics/index.jsx:220-224`) — still needs the FE+BE pair, not a solo backend patch |
| G22 validateAccessToken unbound | 🔴 open | `middleware/validateAccessToken.js:11-51` | still never compares `integration.shopId` to the shop resolved from `X-SEO-Shop-Domain`; still concretely exploitable via `appProxyController.handleBFCMFromSeoOn`/`deactivateSeoOnFromBfcm` |
| G23 integration key plaintext | 🔴 open | `repositories/integrationRepository.js:getIntegrationKey` (~38) | still `.where('accessToken', '==', accessToken)` |
| G24 YouTube key leak | 🔴 open — **ROTATE (precaution), still not done** | `services/proxy-go/internal/youtubex/client.go:hasCaptions` (~92-112), `internal/handler/youtube.go:45` | `err.Error()` still returned verbatim + logged, still can embed the `key=` query param on upstream failure |
| task-13 langGraph regen uncharged | 🔴 open | `langGraphController.js:regenerateFeaturedImage` (~227), `regenerateMetadata` (~257) | still zero balance check, zero `reduceTokens`, zero rate limit — calls Recraft/LLM for free on every hit |
| task-14 shopInfos raw body | 🔴 open | `controllers/shopInfosController.js:updateShopInfos`, `repositories/shopInfoRepository.js:updateShopInfosData` | still `updateShopInfosData(shopInfo.idShopInfo, ctx.req.body)` — whole body written, no allowlist, `shopId`/`idShopInfo`/`id` not stripped |

### Already-fixed items — re-verified still fixed (7/7)

| Item | Still fixed? | Evidence at master |
|---|---|---|
| `appIntegationKeys.js` (FAL-759, SEO Pro token) | ✅ | still `process.env.AVADA_SEO_PRO_ACCESS_TOKEN \|\| ''`; upstream *appended* two new sibling-bundle keys in the same env-only style (commit `5c08db4c3` et al.) — pattern reinforced, not weakened |
| `autoTranslateV2.js` (FAL-759, Google Translate key) | ✅ | real path is `commands/autoTranslateV2.js`; still env-required, no fallback |
| `crisp.js` (FAL-759) | ✅ | real path `services/config/crisp.js`; still all four fields `process.env.CRISP_* \|\| ''` |
| `devZoneController.js` dcdd6a27c gate | ✅ (gate itself) | `update()` still gates every branch behind `canAccessDevZone(...) \|\| viaInternal` before any `switch` case — but see G12 note, the *scope* of `viaInternal` widened |
| `integrationKeyController.js` (FAL-757, `toPublicKey`) | ✅ | still whitelist `{id,name,type,createdAt}`, `accessToken` not returned |
| `integrationKeyController.js` (FAL-757, `createIntegrationKey` shopId binding) | ✅ | still `shopId: getCurrentUser(ctx)?.shopID` forced from session, comment intact |
| `swaggerAuth.js` (FAL-757, shop binding) | ✅ | still `if (!integration.shopId \|\| integration.shopId !== shopID) → 403`, comment intact |

## New 🔴 in the d1c15544a..origin/master gap (64 commits, same vuln classes)

**`canInternalUseDevZone` widened from an allowlist to "any type"** — commit `29b2da68a
feat(dev-zone): open every dev zone type to the dev-zone support key` (part of the 64, unrelated
to our fix work).

- Before (at `d1c15544a`, our fix branch's base): `INTERNAL_DEV_ZONE_TYPES = ['legacy-plan']` — an
  internal support key with the `devZone` capability could only run the `legacy-plan` branch.
- Now (`helpers/devZoneAccess.js:canInternalUseDevZone`): `return typeof type === 'string' &&
  type !== '';` — **any** `type` is accepted, including `set-token` (rewrites a shop's credit
  balance), `update-token-free` (fans out over every shop in the app), and the `redis-*` family
  (G12's finding — unscoped key/pattern read of shared Redis, can read another shop's cached
  `accessToken`).
- Net effect: G12 was already "real (reduced scope)" in the original audit because only CRM
  login-as sessions (verified humans) could reach `redis-get`/`redis-keys`. That reduction is now
  **gone** — any internal support key minted with `devZone: true` (an `actor` string the caller
  supplies, not a verified identity, per the function's own updated docstring) can now also hit
  `set-token` and `redis-*`. This raises G12 from "medium, staff-CRM-only" toward the same severity
  class as G9 (unscoped doc mutation) and G23 (plaintext key exfil via Redis cache), reachable by
  anyone holding a devZone-capable internal key, not just CRM login-as.
- Not something to silently fold into the existing G12 task — flag to Tuan explicitly: the fix
  scope for G12 needs to also re-narrow `canInternalUseDevZone`, or the internal-key path defeats
  whatever shop-scoping gets added to `redis-get`/`redis-keys`.

No other new high-severity issue found in the 64-commit gap. Scanned: the FAL-658 all-in-one
bundle feature (largest chunk, ~55 commits) added a *new* cross-app trust boundary
(`middleware/requireSiblingApp.js` + `controllers/allInOneController.js`, routes
`POST /proxy/blog/all-in-one/state`, `GET /proxy/blog/all-in-one/eligibility`) that takes the shop
from `X-SEO-Shop-Domain` the same way G22's exploited routes do — but unlike G22, it authenticates
with a **separate, static, timing-safe-compared sibling key** (`BUNDLE_SIBLING_KEY_SEO/APC`), never
looked up from the merchant-mintable `integrationKeys` collection, and the code comment explicitly
names the G22-class risk it was written to avoid. Not a new finding, but it's now the *second*
place using "shared key + header shop" instead of a per-shop bound key — worth remembering when G22
finally gets designed (Task 4 was BLOCKED pending exactly that redesign). Also checked: the 6
non-bundle security-flavored commits at the top of the 64 (`611a43a3b` author-field HTML escape,
`f2a5c6eb9` JSON-LD JSON-encoding, `8fe125a4a` ai-summary HTML sanitize, `6488662db` drop visitor
IP from a log line, `b8224703a` GDPR compliance webhooks mounted behind `@avada/core`'s existing
HMAC check, `22d2f7cac` alt-text token-per-alt-written) are all legitimate independent fixes, none
overlap our 26 findings, none introduce a new hole.

## Rebase risk — files our branch touches that changed upstream since `d1c15544a`

Our branch's 48 touched files vs. the 64-commit diff: **7 overlap.**

| File | Upstream change (d1c15544a..master) | Our branch's change | Risk |
|---|---|---|---|
| `controllers/langGraphController.js` | **Structural**: added auto-tag generation inline in `generate()` — new `tags` field on the SSE `result` event, new `tagToken`/`total_token` fields, new `reduceTokens(...)` call for `AI_AUTO_TAG` with its own `idempotencyKey` derived from `generationId` | Also rewrites `generate()` heavily: server-minted idempotency key, `blogGenerationClaims`-backed run/replay state machine, balance-check reordering, stale-run takeover — **same function, same region of code** | 🔴 **High.** Real merge conflict, not just proximity — both sides insert logic around the `reduceTokens`/`writeEvent({type:'total_token'})` block in `generate()`. A mechanical rebase will likely silently drop either the tag-charging logic or the idempotency/replay logic depending on merge direction. Needs a human re-implementation pass on this file, not an auto-merge. Also touches `regenerateFeaturedImage`/`regenerateMetadata` (task-13) — upstream didn't touch those, lower risk there. |
| `controllers/settingsController.js` | Cosmetic: dropped `ip` from one log line inside `voteAISummary` (~line 212) | Changes `getOne` (~34-37, `?domain=` gating) and `update`/`getBlogs` elsewhere in the same file | 🟡 Low. Different functions, non-adjacent lines — should merge cleanly, but re-diff after rebase since line numbers shift. |
| `routes/proxy.js` | Added two new routes (`POST /blog/all-in-one/state`, `GET /blog/all-in-one/eligibility`) plus two new imports, inserted right after the BFCM routes (~line 68-79) | Removes the `GET /ai-summary/blogs` route (near top of file, ~line 45-49 per original notes) | 🟢 Low-medium. Different regions of the file; a line-based patch should apply, but worth a visual diff since router files churn easily. |
| `routes/api.js` | Added `all-in-one` and `tags/ai-generate` routes (~line 73-130) | Adds `requireDevZone` on `/competitors` POST/DELETE (~line 294-298) | 🟢 Low. Different lines, no semantic overlap. |
| `controllers/devZoneController.js` | Comment-only rewording (no code change in this file) — the real change is in `helpers/devZoneAccess.js` (see "New 🔴" above) | Task 7 doesn't touch this file's gate logic directly (only `featureReq.controller.js` + `routes/api.js` + new `requireDevZone.js`) | 🟢 None on this file, but **re-verify G12's eventual fix against the widened `canInternalUseDevZone`**, not just this controller. |
| `const/appIntegationKeys.js` | Appended 4 new env-only consts (2 AI-product-copy tokens, 2 bundle sibling keys) | Not touched by our branch | 🟢 None — append-only, no conflict. |
| `assets/src/helpers.js` (note: **not** the G21 file — that's `functions/src/helpers/helpers.js`, untouched) | Reworked fetch header defaults + error-message field (`data?.error` before `data?.message`) in `createApi()` | Not touched by our branch | 🟢 None. |

**Not at risk / clean:** all G9 files (`authorController.js`, `componentsController.js`,
`sidebarAdsController.js`, `sidebarAdsController.js`), `blogAssist.*`, `genAIBlogController.js`,
`shopController.js`, `shopInfosController.js`, `competitorsController.js`,
`GoogleAnalyticsConfig.jsx`, `clientFetchSSE.js`, `debugHelper.js`, `ModalImport.js`, all rules
files, all credential files — zero commits touching them in the 64-commit gap.

## Recommendation

Rebase order: land `langGraphController.js` (task 3 + task 13 + G14) **first**, by hand — diff it
against the current master version, re-apply the idempotency/replay/charging logic on top of the
new tag-generation code rather than trusting a mechanical rebase. Everything else in the branch
(41 of 48 files) is untouched upstream and should apply cleanly. Re-scope the G12 fix to also
tighten `canInternalUseDevZone` back down, since `29b2da68a` reopened the exact blast radius it was
narrowing.
