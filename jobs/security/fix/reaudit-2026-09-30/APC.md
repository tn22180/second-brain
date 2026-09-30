# APC security re-audit — 2026-09-30

Prod ref = tag `v1.6.45` = `origin/master` = **`1744d88`** (same commit, confirmed via
`git rev-parse` and `git merge-base`). Our base was `b216428`; 63 commits landed on master since
(FAL-658 all-in-one bundle billing + a few unrelated fixes), none of them ours — branch
`fix/security-high-2026-09` (HEAD `215c37a`) is still local-only, not pushed/merged.

Method: read-only (`git -C … show/grep <ref>:<path>`), no checkout.

## Row-by-row (23 real findings from `verify/APC.md`)

| Group | file:line | Verdict @ 1744d88 | Note |
|---|---|---|---|
| committed-credentials | `.npmrc:1` | **still open** | token unchanged, byte-identical |
| committed-credentials | `packages/functions/.npmrc:1` | **still open** | same, no commits touched either file |
| open-firestore-rules | `firestore.rules:7-27` | **still open** | file byte-identical to our base — all 6 collections readable, 3 writable `if true` |
| client-bundled-secrets | `AppBadgeBranch.jsx:9` | **still open** | `VITE_RELEASE_API_TOKEN` read unchanged |
| client-bundled-secrets | `SeoLegacyPlanModal.jsx:7,56` | **partially fixed, incidentally** | still imports `AVADA_SEO_PRO_ACCESS_TOKEN` from `@functions/const/appIntegationKeys`, but that const now reads `process.env.AVADA_SEO_PRO_ACCESS_TOKEN \|\| ''` (see next row) instead of a hardcoded literal — no `define` entry in `vite.config.js` replaces it, so this specific import path no longer bakes a real secret into the bundle. The architecture violation (assets importing `@functions`) is untouched, and — per our branch's own Task 2 finding — the same token value ships in the bundle anyway via the **public npm package `avada-components-seoon`** (unrelated vector, still live) |
| committed-credentials | `appIntegationKeys.js:1` | **fixed by someone else** — `11a675b [FAL-658] fix: read integration keys from the environment` (+ `4363c8e` sets the prod values as env). No longer a committed literal |
| committed-credentials | `graphql/codegen.js:7` | **moved, not re-checked as vulnerable** — file relocated to `packages/functions/src/graphql/codegen.js` under FAL-658 restructuring; did not re-diff its content (out of the 23-item literal path, flagging for Tuan to re-grep if it matters — dev-only script, low priority) |
| unauthenticated-extension-routes | `flowController.js:16-17`, `routes/extension.js:6` | **still open** | `shopify_domain` from body, router still `cors()`-only, zero signature check |
| unowned-process-mutation | `generatorController.js:90-91`, `bulkGenerateProcessRepository.js updateRegenerateProcess` | **still open** | `updateRegenerateProcess(regenerateProcessId, itemIds)` — no shopId param, no owner check |
| untrusted-credit-math | `generatorController.js:113` (creation ceiling) | **still open** | `creditCost: computeCreditCost(model, totalCount)`, `model` still straight from body |
| body-controlled-ownership-fields | `settingsController.js:38` / `settingsRepository.js` | **still open** | `postData = {...data}` unfiltered → `collection.doc(id).update({...data, updatedAt})`, no shopId reassertion |
| self-grant-entitlement-flags | `shopController.js:54-68` | **still open** | `pick(data, [...'noLimit','enablePro','enableGpt41'...])` straight from body, **zero gate** (worse than our branch's fixed state, which requires `canAccessDevZone`) |
| url-param-shop-resolution | `shopifyController.js:115-119` | **still open** | `syncShop(shopify, ctx.params.shopifyDomain)` — URL param, never compared to session shop |
| committed-credentials | `crisp.js:4-7` | **still open** | all 4 fields hardcoded, unchanged |
| untrusted-credit-math | `creditGuardMiddleware.js:26-64` | **still open** | `{creditCost, model}` from body, type-checked only, used verbatim to gate + deduct. `creditQuoteService.js` (our branch's server-side pricing) **does not exist on master** |
| credential-in-querystring | `swaggerAuth.js:26-27`, `routes/proxy.js:10` | **still open** | `ctx.query.accessToken`, no header alternative. FAL-720 cross-tenant half stays fixed (shop derived from key via `resolveKeyShop`) |
| webhook-hmac-disabled | `verifyWebhook.js:12-23` | **still open** | HMAC block still fully commented out, `next()` unconditional |
| shop-doc-in-pubsub | `subscribeSyncProducts.js:10-27` | **still open** | re-publishes raw `{shop, cursor, historyId}` every page |
| body-controlled-ownership-fields | `bulkGenerateProcessRepository.js:13-15` (`createProcess`) | **still open** | `collection.add({shopId, isDone:false, ...data, createdAt})` — `...data` still after `shopId` |
| body-controlled-ownership-fields | `templateRepository.js:32-46` (`updateOrCreateByShopId`) | **still open, distinct from a real fix nearby** | `POST /templates` → `createOne` → `updateOrCreateByShopId` still does `collection.doc(templateData.id).update(template)` with **no ownership check** on the existing doc — a body `id` of another shop's template both overwrites its content and re-parents `shopId`. **Note:** `PUT /templates/:id` → `updateOne` → `updateById(id, shopId, templateData)` **was** fixed (`doc.data()?.shopId !== shopId` check, comment cites FAL-720) — but that's a different function/route than the one the finding cites. The vulnerable line (`templateRepository.js:39`, inside `updateOrCreateByShopId`) is untouched |
| committed-credentials | `crisp.js` (dup rows) | **still open** | see above |
| secret-in-error-log | `errorService.js:8-13`, `seoService.js:13-32`, `logger.js` | **still open** | `logger.js` still bare `console.error(...args)`, zero redaction |
| shop-doc-in-pubsub | `shopifyService.js:733-735` (`startBulkProductExport`) | **still open** | still `publishTopic('syncProducts', {shop, historyId})` with the raw doc from `getShopByField` (not `presentShop()`-stripped) |

**Counts: 23/23 still open** at `1744d88` (1 fixed-by-someone-else outright — `appIntegationKeys.js` — and it happens to neutralize one dup row's literal-secret exposure; everything else, including the credit-math, ownership, HMAC and rules groups, is untouched).

## Extra items (from `01-apc.md` ## Progress — round 2-4 discoveries)

All of these live inside the credit-guard/credit-quote rewrite our branch did (`creditGuardMiddleware.js`, `generatorController.js`, `subscribeHandleBulkGenerate.js`, `reduceCredits.js`, `bulkGenerateProcessRepository.js finalizeProcess`). None of that exists on master:

- `packages/functions/src/services/creditQuoteService.js` — **does not exist** on master.
- `productCount.js` / `collectionCount.js` fail-open (`catch → return 0`) — **still open**, unchanged.
- `subscribeHandleBulkGenerate.js:326` still reads `settings.model` (current settings), not a model locked to the process at creation time — **still open** (worker model-lock issue unfixed).
- `reduceCredits.js` has no `refundCredits`/`{charged}` counterpart, no atomic charge-before-work, no `creditCharged`/refund-cap field on the process doc — **all still open**.
- `logger.redact` nested-object fix — moot, `logger.js` has no redaction at all on master.

So: selectAll+`deselectedIds` free-generation chain, re-optimize-for-free, double-refund, and refund/usage mismatch are all **still exploitable** on master exactly as our branch found them.

## Rebase-conflict risk

`git diff --stat b216428 origin/master` restricted to the paths our branch touches — only **6 files** changed upstream (out of ~50 our branch touches):

| File | Upstream change | Conflict risk |
|---|---|---|
| `packages/assets/src/components/SeoLegacyPlanModal/SeoLegacyPlanModal.jsx` | FAL-658 adds `isAllInOnePlan` gate to the same `useQuery`/`useEffect` block our Task 2 rewired to call the backend proxy | **medium** — same function, adjacent lines |
| `packages/functions/src/controllers/generatorController.js` | FAL-658 adds `logCreditGranted(shop.id, refund, CREDIT_GRANT.REFUND)` right after the refund-credit call in `cancelProcess` | **medium** — our round-4 fix (`refundCredits` helper, `armedProcessId`) rewrites this exact block |
| `packages/functions/src/handlers/subscribeHandleBulkGenerate.js` | Same `logCreditGranted` call added right after the refund block in `handleDoneProcess` | **medium** — our round-3/4 fixes (worker give-up refund, `totalCount` fix) rewrite this exact block |
| `packages/functions/src/controllers/shopController.js` | Unrelated: `applyBFCMDiscount` drops the now-env-sourced SEO token import/params | **low** — different function than our G8 fix (`update()`) |
| `packages/functions/src/routes/api.js` | New unrelated route `GET /all-in-one` | **low** — additive, different line region than our new routes |
| `packages/functions/src/services/shopifyService.js` | New function `createAppSubscriptionWebhook` appended at file end | **low** — pure addition, our G13 fix is mid-file (`startBulkProductExport`) |

44 other touched files (rules, all controllers/repos in the ownership/auth groups, middleware, pubsub, logger, swaggerAuth, verifyWebhook, extension routes) are **untouched upstream** — clean rebase for those. The 3 medium-risk spots are all in the credit-refund logging path (`logCreditGranted` calls FAL-658 added); resolvable by keeping both — call `logCreditGranted` after our `refundCredits`/`finalizeProcess` calls land.

## New high-severity scan, b216428..origin/master (63 commits, all FAL-658 all-in-one-bundle + a few unrelated)

Scanned the new cross-app surface this feature adds (shared bundle billing across SEO/Blog/APC):

- **`middleware/requireSiblingApp.js`** (new) — per-sibling-app shared key (`BUNDLE_SIBLING_KEY_SEO`/`_BLOG`, env-only, no default), `crypto.timingSafeEqual`, target shop taken from `X-SEO-Shop-Domain` header with a `myshopify.com` substring check. This is deliberately shop-unbound (server-to-server, sibling acts on behalf of arbitrary shops by design) — same trust shape as the existing fleet-wide unbound-integration-key issue, but scoped to 2 hardcoded sibling apps with their own secret, not the general swagger-token surface. Not flagging as new — consistent with intended design, no hardcoded key found.
- **`controllers/allInOneController.js`** (new) — `receiveBundleState`/`reportEligibility` write/read shop bundle state keyed off `requireSiblingApp`; **no raw body spread** — `applyRemoteBundleState` → `pickRemoteBundleState(state)` whitelists via `REMOTE_BUNDLE_FIELDS.reduce(...)`, same pattern as a proper `pick()`. Clean.
- **`services/gdprService.js`** (new) — mandatory compliance webhooks route through `@avada/core`'s `shopifyAuth` router (separate from the broken `verifyWebhook.js`), which does its own HMAC check per its header comment. Confirms the Progress-doc note that GDPR never went through the disabled-HMAC middleware.
- Grepped the full 63-commit diff for hardcoded credential patterns (`authToken`, `apiKey:`, `secret:`, literal `accessToken:` strings) — every hit is a test fixture (`'test-secret'`, `'token-key'`, etc.), **no new committed credential**.

**No new 🔴 found** in the classes asked for (auth bypass, cross-shop IDOR, shop-doc writes from body, credit-free paths, secrets). Caveat: this was a targeted scan of the new auth/write entry points, not a full line-by-line audit of the bundle billing state machine (`activateBundle`, `cancelBundleCharge`, the daily healer sweep, Shopify charge verification in `59366f3`) — that subsystem is sizable and money-adjacent; a dedicated pass would be needed to certify it, out of scope for this re-audit's time budget.
