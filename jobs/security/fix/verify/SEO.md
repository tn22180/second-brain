# SEO security findings — verified

Ref: `origin/master` @ `0547925a9cb4da57d99b3087e37e304933ccbd8e` (2026-09-23).
Known context folded in: MR !2286 fixed only the MCP branch of the `/chatbot` cross-tenant bug —
turns out moot, the whole `/chatbot` controller/router was deleted as dead code on 2026-09-21
(row 19). `fixProBackToFree.js` prod-token hardcode and weak `MCP_OAUTH_SECRET` are known,
outside this TSV, not re-verified here.

**Counts:** 83 rows → **47 real**, **29 dup**, **6 already-fixed**, **1 refuted**.

Line numbers drifted on a handful of rows (worst: row 66 pointed at an unrelated function,
`prepareResetData` instead of `incrementAIUsage` — corrected in the table). Most rows landed
within a few lines of the TSV.

## Row-by-row

| # | file:line | verdict | anchor | group | evidence |
|---|---|---|---|---|---|
| 1 | .npmrc:1 | real | root `.npmrc` | committed-credentials | npm registry `_authToken` for registry.avada.io, tracked. **ROTATE.** |
| 2 | .yarnrc.yml:12 | dup | same | committed-credentials | dup of #1 — `npmScopes.avada.npmAuthToken`, identical value |
| 3 | extensions/firestore-bigquery-export.env:4 | real | `COLLECTION_PATH=shops` | bigquery-shops-no-filter | whole `shops` docs (incl. `accessTokenHash`) mirrored to BigQuery; this extension's config format has no field-filter param at all |
| 4 | extensions/firestore-bigquery-export.env:20 | real | `TRANSFORM_FUNCTION` | bigquery-shops-no-filter | external Cloud Function receives the full export stream before it lands in BigQuery — same config file/root cause as #3, distinct exposure hop, kept separate |
| 5 | firestore.rules:7-12 | real | `generateBulk` + `items` match block | firestore-rules-generatebulk-open | `allow read, write: if true`, unconditional, both collection and subcollection |
| 6 | packages/functions/.npmrc:1 | dup | same | committed-credentials | dup of #1 — 3rd tracked copy of the same token |
| 7 | packages/functions/src/commands/getAccessToken.js:7 | real | `getAccessToken` CLI | cli-token-plaintext-log | `logger.debug(accessToken)` after AES-decrypting `accessTokenHash` — ops script, real exposure to whoever runs it / the log sink |
| 8 | packages/functions/src/commands/testAuth.js:14 | real | `testAuth.js` OAuth2 constructor | committed-credentials | Google OAuth client secret, `GOCSPX-` format, hardcoded. **ROTATE.** |
| 9 | packages/functions/src/config/pickFields.js:200,232-242 | real | `blockFields`/`privilegedFields` | ai-credit-unvalidated-input | `AICreditQuota` is in the read-shaping `pickFields` list but absent from both write-filter arrays — `POST /api/shop` writes it straight to Firestore |
| 10 | packages/functions/src/const/appIntegationKeys.js:1-20 | already-fixed | — | — | all 5 tokens now `process.env.X \|\| ''`; comment cites FAL-748. No literal credential remains at this ref |
| 11 | packages/functions/src/controllers/aiChatController.js:29 | real | `getMetaSuggestion` (`faqs` action) | ai-credit-unvalidated-input | `creditsUsed = request?.numberOfFaqs \|\| 1` from body; negative value drives the credit-ledger increment negative → refunds usage |
| 12 | packages/functions/src/controllers/analysisController.js:406 | real | `GET /api/analysis/:type/:id` (`getOne`) | analysis-doc-missing-ownership-check | `getProduct` merges `getAnalysis(id)` (no shop filter) with `getProductById` which returns `null`/`{}` on any GraphQL error instead of throwing — foreign shop's doc comes back |
| 13 | analysisController.js:429 | dup | same handler | analysis-doc-missing-ownership-check | dup of #12, one route (`/api` + bare prefix), different cited line |
| 14 | analysisController.js:569 | real | `POST /publish-resource/:type/:id` (`publishResource`) | analysis-doc-missing-ownership-check | reads via `getAnalysis(id)`, no shop scoping |
| 15 | analysisController.js:666 | dup | same handler | analysis-doc-missing-ownership-check | dup of #14; "re-stamps with attacker shopID" = `analysisRepository.updateByType` building `{type, shopID: <caller's own shop>, ...}` |
| 16 | analysisController.js:761-910 | real | `GET /api/analysis/:type/:id/meta-tags` (`getMultiLanguageMetaTags`) | analysis-doc-missing-ownership-check | same unscoped-merge pattern, distinct handler — kept separate per instructions, same root cause |
| 17 | packages/functions/src/controllers/blogAppIntegrationController.js:15 | real | `GET /api/integration/blogApp/keys` (`getOne`) | integration-key-create-and-blogapp-leak | returns the raw Firestore doc incl. plaintext `accessToken`; gated only by ordinary merchant session auth, no admin/internal check |
| 18 | blogAppIntegrationController.js:16 | dup | same handler | integration-key-create-and-blogapp-leak | dup of #17 — `?name=` is the same param already read |
| 19 | packages/functions/src/controllers/chatbotController.js:242 | already-fixed | — | — | file doesn't exist at this ref. Commit `868ca4b90ff` (2026-09-21, confirmed ancestor) deleted the whole `/chatbot` controller/router/middleware as dead code (no `firebase.json` rewrite, no Cloud Run service) — commit message explicitly names this exact cross-tenant bug as the reason |
| 20 | packages/functions/src/controllers/creditCartController.js:101 | real | `GET /api/credit-cart/activate` (`activateCart`) | creditcart-no-charge-verification | `chargeId` from query, credits granted if `bundle.status !== 'active'`, no call to Shopify to confirm the `appPurchaseOneTime` charge; no `APP_PURCHASES_ONE_TIME_UPDATE` webhook handler exists either — this is the only place credits get granted |
| 21 | creditCartController.js:133 | dup | same handler | creditcart-no-charge-verification | dup of #20, same function, the credit-grant statement |
| 22 | packages/functions/src/controllers/historyOptimizeController.js:119 | real | `GET /history-optimize/:id` (`getOne`) | id-keyed-doc-missing-shop-check | `getHistoryOptimizeById(id)` → `doc.get()` with no shopId filter anywhere in the chain |
| 23 | packages/functions/src/controllers/integrationKeyController.js:12-31 | already-fixed | — | — | response whitelisted to `id/name/type/shopId/createdAt`, `accessToken` dropped (FAL-746) |
| 24 | integrationKeyController.js:39-47 | real | `POST /api/integration/keys` (`createOne`) | integration-key-create-and-blogapp-leak | body `{name,type,shopId}` → `createIntegrationKey` verbatim, no check `shopId === session shop`. Blast radius smaller than it looks — no endpoint reads `accessToken` back on this controller (that's #17's job on the sibling) — but still a key-squatting / cross-tenant-bound-key write |
| 25 | packages/functions/src/controllers/revertController.js:9-45 | real | `GET /proxy/get-jsonl-data/:id` (`getJsonlOptimizeHistory`) | unauthenticated-proxy-routes | `routes/proxy.js` mounts with **zero** middleware; hands out a signed download URL for any shop's backup by enumerable numeric id |
| 26 | revertController.js:11 | dup | same handler | unauthenticated-proxy-routes | dup of #25 |
| 27 | revertController.js:49-73 | real | `POST /proxy/revert-product/:id` (`revertProductByLog`) | unauthenticated-proxy-routes | zero middleware; mutates any shop's product images/alt text from an attacker-supplied URL body param |
| 28 | revertController.js:51 | dup | same handler | unauthenticated-proxy-routes | dup of #27 |
| 29 | packages/functions/src/controllers/seoController.js:138-142 | real | `GET /api/settings`, `/api/settings/:field` (`get`) | shopid-query-override | `shopID = shopId \|\| getCurrentShop(ctx)` — query param wins over session shop. Behind global `/api` auth (**any** valid merchant session required, not anonymous-reachable) |
| 30 | seoController.js:138 | dup | same handler | shopid-query-override | dup of #29 |
| 31 | seoController.js:140 | dup | same handler | shopid-query-override | dup of #29 |
| 32 | seoController.js:687-696 | real | `GET /proxy/republish/:shopId` (`republishClient`) | unauthenticated-proxy-routes | `shopID` from `ctx.params`, zero middleware in `routes/proxy.js`, writes to the shop's live theme |
| 33 | seoController.js:729 | dup | (of #34) | triggercron-unrestricted-dispatch | dup of #34 |
| 34 | seoController.js:722-731 | real | `POST /api/triggerCron` | triggercron-unrestricted-dispatch | shop **is** correctly session-scoped (`getCurrentShop`, not cross-tenant) — but `topic`/`data` come straight from the body with zero validation before `dispatchWork(topic, {...data, shop})`; no topic whitelist, no rate limiter on the route |
| 35 | packages/functions/src/controllers/shopController.js:136 | dup | (of #37) | settings-not-redacted | dup of #37 |
| 36 | shopController.js:138 | dup | (of #37) | settings-not-redacted | dup of #37 |
| 37 | shopController.js:140 | real | `GET /proxy/shop` (`getShopProxy`) | settings-not-redacted | raw `getSettings()` output returned, never passed through the existing `redactSettings()` presenter (already wired into seoController ×3, googleController, MCP read tools) — an incomplete rollout, not a never-addressed hole |
| 38 | shopController.js:259-262 | real | `POST /api/shop` (`set`) | ai-credit-unvalidated-input | raw body → `updateShopData`; `AIUsage`/`AICreditQuota` absent from `blockFields`/`privilegedFields`; `prepareUpdateData` (shopRepository.js) explicitly handles `postData.AIUsage` |
| 39 | shopController.js:278-281 | real | `POST /api/shop/reduce-credit` (`reduceCredit`) | ai-credit-unvalidated-input | client `amount` passed straight to `incrementAIUsage`, no positivity check — negative amount inflates the caller's own balance. Same bug as #66, one layer up |
| 40 | packages/functions/src/controllers/shopifyController.js:664 | **refuted** | — | — | `logger.debug` is silenced by default in prod/staging (`helpers/logger.js:18-20`, `defaultLevel='warn'`); no `LOG_LEVEL=debug` found in any prod env file. Line exists but doesn't execute under normal config — would go live again if log level is ever raised |
| 41 | packages/functions/src/controllers/subscriptionController.js:33-34 | real | `GET /api/subscription` (`getSubscription`) | shopid-query-override | `shopId` query param wins over session shop; also returns unfiltered settings (compounds `settings-not-redacted`) |
| 42 | subscriptionController.js:34 | dup | same handler | shopid-query-override | dup of #41 |
| 43 | packages/functions/src/featureReq/featureReq.controller.js:211 | real | `POST /api/block-user-req` (`blockUser`) | block-user-req-no-ownership | `deleteFeatureReqsByShopId(blockId)` — `blockId` from body verbatim, zero `isAdmin`/internal check in the whole file. Shared/global feature-request board → cross-tenant destructive delete |
| 44 | packages/functions/src/handlers/internalTools.js:73-76 | real | `GET /internal/redis-cache/dump` (`cacheDump`) | internal-redis-cache-shared-secret | returns raw Redis values incl. `shop:<id>` keys (full shop doc, `accessToken`); gated by a single `X-Internal-Token` header compare; `internalGen2` deployed `onRequest` with **no ingress restriction** → public-internet reachable if the token leaks |
| 45 | internalTools.js:76 | dup | same route | internal-redis-cache-shared-secret | dup of #44 |
| 46 | internalTools.js:84 | dup | same root cause, `/inspect` variant | internal-redis-cache-shared-secret | dup of #44, extends to `/redis-cache/inspect`, identical gate/exposure |
| 47 | packages/functions/src/handlers/lightHouseAuditHandler.js:14 | real | `GET /lighthouse/auditNew` | lighthouse-ssrf-public | `httpFunctions.js` sets `invoker:'public'` explicitly; zero auth in the handler chain; `ctx.query.url` → `page.goto(url)` with no domain allowlist (SSRF) |
| 48 | packages/functions/src/handlers/proxy/controllers/imageController.js:16 | real | `optimizeImage` (`POST /proxy/optimizeImage`) | integration-key-not-bound-to-shop | target shop picked from `X-SEO-Shop-Domain` header rather than the authenticated integration's bound `shopId`. Route *is* gated by `validateAccessToken` — but that middleware itself doesn't bind key→shop (same root cause as #59) |
| 49 | packages/functions/src/handlers/pubsub/subscribeBulkAuditFixApplyProduct.js:32-38 | real | `subscribeBulkAuditFixApplyProduct` | pubsub-trusts-payload-shop | loads job by `bulkJobId` and shop by `shopID`, both from the Pub/Sub payload, never checks `job.shopID === shopID` before applying |
| 50 | packages/functions/src/handlers/pubsub/subscribeExportBrokenUrls.js:21-58 | real | `subscribeExportBrokenUrls` | pubsub-trusts-payload-shop | `shopID`/`email` taken straight from the payload; CSV emailed to the payload-supplied address, no cross-check the caller owns `shopID` |
| 51 | packages/functions/src/handlers/reset.js:5 | dup | (of #52) | resetgen2-public-destructive | dup of #52 |
| 52 | reset.js:5-28 | real | `resetGen2` | resetgen2-public-destructive | `httpFunctions.js:117` mounts `onRequest` with no auth wrapper/invoker restriction; `revert-all`/`reset-history` actions run for any caller supplying a real shop domain |
| 53 | packages/functions/src/helpers/trello/addCardToTrello.js:5 | real | — | committed-credentials | Trello API key hardcoded, git-tracked. **ROTATE.** |
| 54 | addCardToTrello.js:6-7 | dup | same | committed-credentials | dup of #53 — Trello user API token + app key, same pair. **ROTATE.** |
| 55 | packages/functions/src/middleware/creditCartActivation.js:5-10 | dup | (of #20) | creditcart-no-charge-verification | `handlers/api.js` does register this middleware before `createAuthMiddleware()` — but that's *intentional* (it's the Shopify billing-redirect GET callback, expected unauthenticated). Being unauthenticated isn't itself the bug; the missing Shopify charge verification (#20) is the actual flaw — not a separate finding |
| 56 | packages/functions/src/middleware/swaggerAuth.js:13-14 | real | `GET /proxy/swagger-token` (`exchangeToken`) | secret-in-url-querystring | `ctx.query.accessToken` accepted as a query param — integration key lands in access logs/referrers/browser history, independent of the shop-binding fix below |
| 57 | swaggerAuth.js:44-49 | already-fixed | — | — | `integration.shopId && integration.shopId === shopID` check added (comment cites FAL-746), fails closed for legacy unbound keys, 403 on mismatch — the "mint session for arbitrary `?shop=`" bug is fixed |
| 58 | swaggerAuth.js:44-49 | already-fixed | — | — | same fix/lines as #57 |
| 59 | packages/functions/src/middleware/validateAccessToken.js:11-44 | real | `validateAccessToken` middleware | integration-key-not-bound-to-shop | resolves integration via `getIntegrationKey(accessToken)` alone; `X-SEO-Shop-Domain` only format-checked, never compared to `integration.shopId`. Gates ~8 `/proxy` routes (seo-audit, speed-score, shop/seo, shop/blog, optimizeImage, optimizeProduct, updateOvrList, bfcm-sale/bundle) |
| 60 | validateAccessToken.js:31 | dup | same | integration-key-not-bound-to-shop | dup of #59 |
| 61 | validateAccessToken.js:32 | dup | same | integration-key-not-bound-to-shop | dup of #59 |
| 62 | validateAccessToken.js:44 | dup | same | integration-key-not-bound-to-shop | dup of #59 |
| 63 | packages/functions/src/repositories/bulkEditRepository.js:77-99 | real | `saveBulkAnalysis` | analysis-doc-missing-ownership-check | writes `analysis/<restId>` by client-supplied id, **no** `shopID` param/check at all — same `analysis` collection as the analysisController group |
| 64 | packages/functions/src/repositories/historyRepository.js:334-361 | real | `revertByListImageLogId` | id-keyed-doc-missing-shop-check | `doc(id).update(data)` with no shop check despite taking a `shop` param; sibling `revertByHistoryId` (line 375-376) **has** `data.shopID !== shop.id` — the guard pattern exists, just omitted here |
| 65 | packages/functions/src/repositories/integrationRepository.js:15-36 | real | `getIntegrationKey` (cache layer) | redis-cache-stores-credentials | `cacheWrap` key = `integration:${accessToken}` (raw token as the Redis key name), cached value = full integration doc incl. `accessToken` field again |
| 66 | packages/functions/src/repositories/shopRepository.js:988-1054 | real | `incrementAIUsage` (TSV pointed at unrelated `prepareResetData:281` — corrected) | ai-credit-unvalidated-input | no lower-bound check on `amount`; negative increment decreases `metaCount`, inflating `remainingPlanCredits`. Same root cause/fix as #39, repo layer |
| 67 | shopRepository.js:309-313 | real | `getShopById` (default `fields=[]` path) | redis-cache-stores-credentials | caches the full `shop.data()` (incl. `accessToken`, `accessTokenHash`) into Redis under `shop:<id>` verbatim. "instantIndexing Google SA JSON" sub-claim unverified/likely wrong — that secret lives in a different service, not this cache path — `accessToken`/`accessTokenHash` alone stands as real |
| 68 | shopRepository.js:412-460 | already-fixed | — | — | `blockFields` stripped unconditionally; privileged-field gate reads a server-set `privileged` option (from `canAccessDevZone` session check in shopController.js), not `postData.isDevZone`. Dedicated regression test exists (`updateShopData.privileged.test.js`) — flag to Tony: git history shows this exact regression recurred multiple times, worth keeping the test in CI |
| 69 | shopRepository.js:442 | dup | (of #68, already-fixed) | — | dup of #68, same code |
| 70 | shopRepository.js:494-497 | real | `updateShopData` `reload` param | reload-param-echoes-fields | `pick(doc.data(), reload)` on a freshly-read full shop doc using client-supplied field names (`postData.reload`), never allowlist-checked — `reload:['accessToken']` echoes the live token back in the response |
| 71 | packages/functions/src/repositories/sitemapRepository.js:372-387 | real | `bulkUpdateSitemap` | id-keyed-doc-missing-shop-check | no `shopId` param at all; blind-writes onto every doc in the client-supplied `ids` array; controller only uses `shopID` for bookkeeping, never to verify `ids` belong to that shop |
| 72 | packages/functions/src/routes/api.js:373,388-393 | dup | (of #17 + #24) | integration-key-create-and-blogapp-leak | route-level restatement combining the blogApp `getOne` leak (#17) and `createOne` shopId gap (#24) |
| 73 | packages/functions/src/routes/proxy.js:38 | dup | (of #32 + #75) | unauthenticated-proxy-routes | combined restatement of the republish + updateObfucate routes |
| 74 | routes/proxy.js:43 | dup | (of #32) | unauthenticated-proxy-routes | same route (republish) as #32, route-file-side citation |
| 75 | routes/proxy.js:80 | real | `GET /proxy/updateObfucate/:shopId` (`devController.updateObfucate`) | unauthenticated-proxy-routes | zero middleware; calls the Shopify Admin API with the target shop's access token |
| 76 | routes/proxy.js:94 | dup | (of #25 + #27) | unauthenticated-proxy-routes | combined restatement of get-jsonl-data + revert-product |
| 77 | routes/proxy.js:99 | dup | (of #25) | unauthenticated-proxy-routes | same route as #25 |
| 78 | routes/proxy.js:101 | dup | (of #27) | unauthenticated-proxy-routes | same route as #27 |
| 79 | packages/functions/src/services/avadaService.js:91-107 | real | `upgradePlan` | avadaservice-leaks-shopdoc | `{shopData, ...triggerData} = params` doesn't mutate `params`; final trigger payload re-spreads `...params` (still has `shopData`) to the external avada.io API |
| 80 | avadaService.js:114-130 | real | `downgradePlan` | avadaservice-leaks-shopdoc | identical pattern to #79 |
| 81 | packages/functions/src/services/bulkEditService.js:657 | real | `PUT /api/analysis-bulk/:type` (`processBulkUpdate`) | analysis-doc-missing-ownership-check | body-supplied `item.id` flows through length-only validation into `saveBulkAnalysis` (#63) — same collection, same missing-ownership root cause |
| 82 | packages/functions/src/services/lightHouseService.js:48-60 | real | `fetchLightHouse` | secret-in-url-querystring | storefront password built into `queryParams` → `urlWithParams` used in the audit request URL |
| 83 | lightHouseService.js:64 | real | `fetchLightHouse` | secret-in-url-querystring | `logger.info` logs the full `urlWithParams` including the password querystring — same function as #82, distinct behavior (transmission vs logging), kept separate |

## Root-cause groups (47 real → 23 fix units)

1. **committed-credentials** (rows 1,2,6,8,53,54; row 10 already-fixed — reuse its pattern) — `.npmrc`, `.yarnrc.yml`, `packages/functions/.npmrc` (npm registry token, one credential ×3 files), `commands/testAuth.js` (Google OAuth client secret), `helpers/trello/addCardToTrello.js` (Trello API key + token).
   Fix: rotate all, move to env vars (mirror the FAL-748 fix already done in `appIntegationKeys.js`), scrub git history if required. No auth-boundary, no migration. **ROTATE.**

2. **bigquery-shops-no-filter** (rows 3,4) — `extensions/firestore-bigquery-export.env`. Whole `shops` collection (incl. `accessTokenHash`) mirrors to BigQuery and through an external transform Cloud Function; extension config has no field-filter option.
   Fix: split off a redacted mirror collection to export instead of `shops` directly, or drop a column-exclusion view in BigQuery post-landing. Touches the data pipeline — **needs-migration**.

3. **firestore-rules-generatebulk-open** (row 5) — `firestore.rules`, `generateBulk` + `items` subcollection, world read+write.
   Fix: add an owner/shopId check matching sibling collections in the same file. This rule **is** the auth boundary — **needs-opus** (any client-SDK-dependent behavior must be checked before tightening, per the `verify-branch`/rules caution learned from the APC audit).

4. **cli-token-plaintext-log** (row 7) — `commands/getAccessToken.js`. Ops CLI decrypts and `logger.debug`s a live token.
   Fix: print via explicit `console.log` gated behind an interactive confirm, not `logger.debug` (which can land in a shared log sink). Low severity, mechanical.

5. **ai-credit-unvalidated-input** (rows 9,11,38,39,66) — `config/pickFields.js` (blockFields/privilegedFields), `controllers/shopController.js` (`set`, `reduceCredit`), `controllers/aiChatController.js` (`faqs`), `repositories/shopRepository.js` (`incrementAIUsage`). Three independent gaps in the same trust boundary: (a) `AICreditQuota`/`AIUsage` writable via raw body on `POST /api/shop`, (b) `reduceCredit`/`incrementAIUsage` accept negative `amount`, (c) `numberOfFaqs` unclamped drives a negative credit cost.
   Fix: add `AICreditQuota`+`AIUsage` to `blockFields`; require `amount > 0` in `incrementAIUsage`; clamp `numberOfFaqs >= 0`. Three small point-fixes, no migration, no auth boundary.

6. **integration-key-not-bound-to-shop** (rows 48,59,60,61,62) — `middleware/validateAccessToken.js` (core bug), `handlers/proxy/controllers/imageController.js` (a consumer that trusts the unbound header instead). Gates ~8 `/proxy` routes.
   Fix: mirror the fix already shipped in `middleware/swaggerAuth.js` (FAL-746, rows 57/58 already-fixed) — after resolving `integration`, compare `integration.shopId` to the shop from `X-SEO-Shop-Domain`, 403 on mismatch. Shared middleware, security-critical, many downstream routes to not break — **needs-opus**, auth boundary.

7. **integration-key-create-and-blogapp-leak** (rows 17,18,24,72) — `controllers/integrationKeyController.js` (`createOne`), `controllers/blogAppIntegrationController.js` (`getOne`), `routes/api.js` (mount). `createOne` mints a key for a body-supplied `shopId`; `blogAppIntegrationController.getOne` never got the FAL-746 response-whitelist fix its sibling controller got and still returns raw `accessToken`.
   Fix: (a) force `shopId` from session in `createOne`; (b) port the FAL-746 field-whitelist from `integrationKeyController.getOne` into `blogAppIntegrationController.getOne`. Mechanical, no migration.

8. **unauthenticated-proxy-routes** (rows 25,26,27,28,32,73,74,75,76,77,78) — `routes/proxy.js` + `controllers/revertController.js`, `controllers/seoController.js` (`republishClient`), `controllers/devController.js` (`updateObfucate`). Exactly 4 distinct routes with **zero** middleware: `GET /proxy/republish/:shopId`, `GET /proxy/updateObfucate/:shopId`, `GET /proxy/get-jsonl-data/:id`, `POST /proxy/revert-product/:id`.
   Public-caller check: sibling routes in the same file that are genuinely meant to be public use `verifyProxySignature` (Shopify app-proxy HMAC) — e.g. `/file/:filename`, `/html-sitemap/:htmlPage`, `/featureReq/:type/:id`. These 4 have no such signature check and no other gate — looks like a plain missing-middleware bug, not an intentional public surface. No legitimate caller (storefront, webhook, cron) depends on them being open.
   Fix: add `verifyProxySignature` or session/`validateAccessToken` auth per route (match how neighboring routes in the same file are protected), plus an ownership check so the `:id`/`:shopId` param can't just be swapped. High-value routes, must pick the right auth mechanism per route without breaking real flows — **needs-opus**, auth boundary.

9. **shopid-query-override** (rows 29,30,31,41,42) — `controllers/seoController.js` (`get`), `controllers/subscriptionController.js` (`getSubscription`). `shopId` query param wins over session shop. Behind global `/api` session auth (not anonymous-reachable) but any of the app's merchants can read any other shop's settings/plan/coupons this way.
   Fix: drop the query override, always use `getCurrentShop(ctx)`. Mechanical, 2 files, same 1-line pattern — not needs-opus despite being cross-tenant authz.

10. **settings-not-redacted** (rows 35,36,37; compounds #9's row 41) — `controllers/shopController.js` (`getShopProxy`), `controllers/subscriptionController.js`. Raw `getSettings()` output returned without the existing `redactSettings()`/`maskInstantIndexing()` presenter that's already wired into seoController, googleController, MCP read tools.
    Fix: call `redactSettings()` before returning `settings` in both places — reuse existing code, no new masking logic needed. No migration.

11. **analysis-doc-missing-ownership-check** (rows 12,13,14,15,16,63,81) — `controllers/analysisController.js` (`getOne`, `publishResource`, `getMultiLanguageMetaTags`), `repositories/bulkEditRepository.js` (`saveBulkAnalysis`), `services/bulkEditService.js` (`processBulkUpdate`). All touch the `analysis` Firestore collection without the ownership check.
    Fix: `isAnalysisOwnedByShop()` (analysisRepository.js) already exists and is wired into `updateAnalysis`/`updateMultiLanguageMetaTags`(POST)/MCP `resolveTarget` — just missing from these 5 entry points. Call it before returning/writing in each. Mechanical reuse of an existing helper, not needs-opus.

12. **id-keyed-doc-missing-shop-check** (rows 22,64,71) — `controllers/historyOptimizeController.js`, `repositories/historyRepository.js` (`revertByListImageLogId`), `repositories/sitemapRepository.js` (`bulkUpdateSitemap`). Different collections, same bug class: doc fetched/written by raw id with no shop field check.
    Fix: copy the guard already present in the sibling function `revertByHistoryId` (historyRepository.js:375-376, `data.shopID !== shop.id`) into each of these. Mechanical.

13. **pubsub-trusts-payload-shop** (rows 49,50) — `handlers/pubsub/subscribeBulkAuditFixApplyProduct.js`, `handlers/pubsub/subscribeExportBrokenUrls.js`. Consumer trusts `shopID`/recipient email straight from the message payload with no ownership cross-check.
    Fix: verify `job.shopID === payload.shopID` before acting; validate recipient email against the shop's own registered email. Defense-in-depth (these topics are normally self-published by the app's own trusted backend, but any upstream bug that lets an attacker influence the enqueue — e.g. group 8/9 — would chain into this). No auth boundary, no migration.

14. **resetgen2-public-destructive** (rows 51,52) — `handlers/reset.js`, mounted via `httpFunctions.js` with no auth wrapper. No legitimate public caller identified (destructive action, not a webhook/cron).
    Fix: add session or internal-token auth in front of `resetGen2`. Single endpoint, mechanical, but high severity — auth boundary.

15. **lighthouse-ssrf-public** (row 47) — `handlers/lightHouseAuditHandler.js`, explicit `invoker:'public'`. Fetches an attacker-supplied URL with headless Chrome, no domain allowlist.
    Fix: require session/signature auth and/or restrict fetchable domains (SSRF mitigation even if kept public). Flag to product whether "public" was ever intentional before changing — auth boundary.

16. **internal-redis-cache-shared-secret** (rows 44,45,46) — `handlers/internalTools.js`, `/internal/redis-cache/dump` + `/inspect`. Gated only by a single `X-Internal-Token` header compare; `internalGen2` has no ingress restriction (public-internet reachable if the token leaks).
    Fix: set Cloud Functions Gen2 ingress to internal-only/VPC, in addition to keeping the token; confirm `INTERNAL_REDIS_TOKEN` strength/rotation (same risk class as the known-weak `MCP_OAUTH_SECRET`). Ops config change, auth boundary.

17. **block-user-req-no-ownership** (row 43) — `featureReq/featureReq.controller.js` (`blockUser`). `blockId` from body deletes another shop's feature-request comments on the shared board, zero admin/ownership check.
    Fix: require `blockId === session shopId`, or add an internal/admin gate if this was meant to be a moderation action. Mechanical, auth boundary (authz).

18. **secret-in-url-querystring** (rows 56,82,83) — `middleware/swaggerAuth.js` (`accessToken` as `?accessToken=`), `services/lightHouseService.js` (storefront password built into the audit URL, then logged in full). Two different credential types, same transmission-pattern bug.
    Fix: move `accessToken` to a header (Authorization/custom header) on the swagger-token route; pass the storefront password via a header/body to the headless-browser fetch instead of the URL, and strip it before logging. No migration, no auth boundary.

19. **avadaservice-leaks-shopdoc** (rows 79,80) — `services/avadaService.js` (`upgradePlan`, `downgradePlan`). `{shopData, ...triggerData} = params` destructure doesn't remove `shopData` from `params`; the final payload re-spreads `...params` anyway, shipping the whole shop doc to the external avada.io API.
    Fix: build the outgoing trigger payload from `triggerData` only, drop the trailing `...params` spread. One-line fix ×2 functions, no migration.

20. **redis-cache-stores-credentials** (rows 65,67) — `repositories/integrationRepository.js` (`getIntegrationKey`, raw token as both Redis key name and cached value), `repositories/shopRepository.js` (`getShopById` default path caches full shop doc incl. `accessToken`/`accessTokenHash`). Self-hosted Redis, not public internet — ties to the known box-credential-surface risk on the worker fleet.
    Fix: whitelist non-sensitive fields before `cacheWrap`; use the integration doc id (not the raw token) as the Redis key name. No migration.

21. **reload-param-echoes-fields** (row 70) — `repositories/shopRepository.js` (`updateShopData`). Client-supplied `reload` array is used unchecked to `pick()` fields off a freshly-read full shop doc and echo them back — including `accessToken`.
    Fix: restrict `reload` to an explicit safe-field allowlist, or drop the feature in favor of the already-redacted read path. Mechanical.

22. **creditcart-no-charge-verification** (rows 20,21,55) — `controllers/creditCartController.js` (`activateCart`), `middleware/creditCartActivation.js` (intentionally pre-auth, that's not the bug). Credits granted from the redirect `charge_id` with no call to Shopify confirming the charge status; no webhook backstop exists either.
    Fix: call Shopify's Admin API (`appPurchaseOneTime` query) to confirm `status === 'ACTIVE'` before crediting. Business-risk (billing integrity) — worth a careful review even though it's not a schema migration.

23. **triggercron-unrestricted-dispatch** (rows 33,34) — `controllers/seoController.js` (`triggerCron`). Shop is correctly session-scoped (not cross-tenant), but `topic`/`data` are unvalidated body input dispatched straight to Pub/Sub — a general-purpose "call any internal handler with attacker payload, scoped to your own shop" primitive.
    Fix: whitelist allowed `topic` values (there's already a `MIGRATED_TOPICS` map in `dispatchWork` to extend), add a rate limiter to the route. Mechanical, no auth boundary (self-shop only).

## Already-fixed (6)

Row 10 (`appIntegationKeys.js`, FAL-748, env vars), row 19 (`chatbotController.js` deleted 2026-09-21), row 23 (`integrationKeyController.getOne` whitelisted, FAL-746), rows 57/58 (`swaggerAuth.js` shop-binding check, FAL-746), row 68 (`updateShopData` `isDevZone` gate now server-controlled, has a regression test — flagged as a recurring regression class worth keeping in CI).

## Refuted (1)

Row 40 (`shopifyController.js:664`) — `logger.debug` call exists but is silenced by default log level (`warn`) in prod/staging; no prod env sets `LOG_LEVEL=debug`. Not exploitable as shipped; would need a config change to reactivate. Worth a CI lint against `logger.debug(..., shop)` patterns as a tripwire.
