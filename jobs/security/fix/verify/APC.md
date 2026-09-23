# APC security findings — verified

Ref: `origin/master` @ `b216428` (2026-09-23). Prior hand-verify (2026-08-21, `420385b`) used as hint only.

**Counts:** 45 rows → **23 real**, **22 dup**, **0 refuted**, **0 already-fixed**.
(One near-miss: `generatorController.js:113` looked refutable — see note — kept `real`, reframed.)

Line numbers in the TSV match this ref almost exactly (near-zero drift).

## Row-by-row

| # | file:line | verdict | anchor | group | evidence |
|---|---|---|---|---|---|
| 1 | .npmrc:1 | real | root `.npmrc` | committed-credentials | `.npmrc:1` — `_authToken` for registry.avada.io in tracked file |
| 2 | firestore.rules:7 | real | `firestore.rules` match blocks | open-firestore-rules | rules:7-27, `bulkGenerateProcesses`/`resultGen`/`analytics` read+write `if true`; `credits`/`historySyncData`/`translateProcesses` read `if true` |
| 3 | firestore.rules:8 | dup | same | open-firestore-rules | dup of #2 (adds "3 writable, read via browser SDK" detail) |
| 4 | firestore.rules:9 | dup | same | open-firestore-rules | dup of #2, calls out the 3 RW collections specifically |
| 5 | firestore.rules:20 | dup | same | open-firestore-rules | dup of #2, calls out the 3 read-only collections specifically |
| 6 | AppBadgeBranch.jsx:9 | real | `ReleaseButton` (assets) | client-bundled-secrets | jsx:8-9 `VITE_RELEASE_API_TOKEN` read via `import.meta.env`, inlined at Vite build time, sent as Bearer header from the browser |
| 7 | AppBadgeBranch.jsx:22 | dup | same | client-bundled-secrets | dup of #6, same token, usage line not decl line |
| 8 | SeoLegacyPlanModal.jsx:7 | real | `SeoLegacyPlanModal` (assets) | client-bundled-secrets | jsx:7 imports `AVADA_SEO_PRO_ACCESS_TOKEN` from `@functions/const/appIntegationKeys` — vite.config.js:216 aliases `@functions` straight to `packages/functions/src`, so this backend const is compiled into the merchant-facing bundle |
| 9 | SeoLegacyPlanModal.jsx:56 | dup | same | client-bundled-secrets | dup of #8, usage line (`axios.get` header) not import line |
| 10 | packages/functions/.npmrc:1 | dup | `packages/functions/.npmrc` | committed-credentials | dup of #1 — byte-identical `_authToken` |
| 11 | autoTranslateV2.js:8 | real | `translate` client init | committed-credentials | commands/autoTranslateV2.js:8 `new Translate({key: 'AIza...'})` hardcoded, no env fallback |
| 12 | appIntegationKeys.js:1 | real | `AVADA_SEO_PRO_ACCESS_TOKEN` const | committed-credentials | const/appIntegationKeys.js:1 |
| 13 | flowController.js:16 | real | `POST /extension/flow/generateProductDesc`, `generateProductSeoDesc` | unauthenticated-extension-routes | flowController.js:16-17 `shopify_domain` from `ctx.req.body`, no session/HMAC check; handlers/extension/index.js mounts the router behind `cors()` only |
| 14 | flowController.js:17 | dup | same | unauthenticated-extension-routes | dup of #13 |
| 15 | generatorController.js:91 | real | `POST /generate` isRegenerate branch | unowned-process-mutation | generatorController.js:90-91 calls `updateRegenerateProcess(regenerateProcessId, itemIds)` with a body-supplied id; bulkGenerateProcessRepository.js:114-123 only checks `doc.exists`, never `shopId`, then deletes/mutates `result` items |
| 16 | generatorController.js:92 | dup | same | unowned-process-mutation | dup of #15 |
| 17 | generatorController.js:113 | real (reframed) | `POST /generate` process creation (both `selectAll` and itemIds branches) | untrusted-credit-math | generatorController.js:113/141 `creditCost: computeCreditCost(model, totalCount)` — `model` is client body data (line 78), so the stored `process.creditCost` (the refund ceiling used later by `finalizeProcess`, repo:99) is attacker-inflatable. Note: the actual refund *arithmetic* at cancel/finalize time is not spoofable — `cancelProcess` (ctrl:365) and `handleDoneProcess` (subscribeHandleBulkGenerate.js:384) both read `model` back from the stored process doc, not from a request body, so the literal claim "refund basis computed from the body's model" is imprecise. The real hole is that the *ceiling itself* is client-set at creation with no server-side price check, which combined with creditGuardMiddleware's separately-client-controlled `creditCost` charge (see group below) lets a shop pay near-nothing up front and refund a large stored ceiling on cancel. Grouped with credit-guard, not the firestore.rules group. |
| 18 | settingsController.js:38 | real | `PUT /settings` (`settingsController.update`) | body-controlled-ownership-fields | settingsController.js:36-40 `postData = {...data}` (unfiltered) passed straight to `updateOrCreateByShopId`; repository (settingsRepository.js:27) does `collection.doc(existingDocId).update({...data,...})` — a body-supplied `shopId` field silently re-parents the doc for future `getByShopId` lookups |
| 19 | shopController.js:54 | real | `PUT /shop` (`shopController.update`) | self-grant-entitlement-flags | shopController.js:59-68 `pick(data, [...,'noLimit','enablePro','enableGpt41',...])`, `data = ctx.req.body` verbatim, `updateShop(shopId, updateData)` — no server-side check on these three flags |
| 20 | shopController.js:55 | dup | same | self-grant-entitlement-flags | dup of #19 |
| 21 | shopController.js:59 | dup | same | self-grant-entitlement-flags | dup of #19 ("PUT /api/shop" = same route, `/api` is the app mount prefix) |
| 22 | shopController.js:61 | dup | same | self-grant-entitlement-flags | dup of #19 |
| 23 | shopifyController.js:115 | real | `GET /syncData/:shopifyDomain` | url-param-shop-resolution | shopifyController.js:115-119 session shop only builds the `shopify` API client; target shop resolved via `installationService.syncShop(shopify, shopifyDomain)` → `getShopByField(shopCtx)` (installationService.js:94-95) looks up an arbitrary shop by the URL's domain, then writes `historySyncData`, creates webhooks, and calls `updateShop(shop.id, {syncDone:true})` against that shop — never compared to the session shop |
| 24 | shopifyController.js:117 | dup | same | url-param-shop-resolution | dup of #23 |
| 25 | shopifyController.js:119 | dup | same | url-param-shop-resolution | dup of #23 |
| 26 | codegen.js:7 | real | graphql codegen dev script | committed-credentials | graphql/codegen.js:7 `process.env.ACCESS_TOKEN \|\| 'shpua_...'` default |
| 27 | creditGuardMiddleware.js:28 | real | `creditGuardMiddleware` | untrusted-credit-math | creditGuardMiddleware.js:26-38 `{creditCost, model}` destructured from `ctx.req.body.data`, only type-checked (`validateRequest`, line 61-64: `typeof creditCost !== 'number'`), used verbatim both to gate (`totalCredit < creditCost`) and to deduct (`creditsToReduce: creditCost`) — never recomputed server-side from `model`+quantity |
| 28 | creditGuardMiddleware.js:38 | dup | same | untrusted-credit-math | dup of #27 |
| 29 | creditGuardMiddleware.js:62 | dup | same | untrusted-credit-math | dup of #27 (the weak `validateRequest` type-check itself) |
| 30 | swaggerAuth.js:27 | real | `GET /proxy/swagger-token` (`exchangeToken`) | credential-in-querystring | swaggerAuth.js:26-27 `ctx.query.accessToken`; routes/proxy.js:10 mounts `/proxy/swagger-token` with no `validateAccessToken`/session gate ahead of it. Note: the file's own comment (line 18-23) documents that FAL-720 already fixed the *cross-tenant forgery* half of this (shop is now derived from the key via `resolveKeyShop`, not from `?shop=`) — that specific sub-issue is already-fixed. The row's actual claim, credential accepted via URL query string on an unauth'd route (leaks via access logs / referrer / browser history), is still true and unfixed. |
| 31 | verifyWebhook.js:12 | real | `verifyWebhook` / `webhookCreateProduct`, `webhookBulkOperation` | webhook-hmac-disabled | webhook/verifyWebhook.js:12-22 HMAC block fully commented out, falls straight to `next()`; handlers/webhooks/createProduct.js and bulkOperation.js both call it as their only gate |
| 32 | verifyWebhook.js:17 | dup | same | webhook-hmac-disabled | dup of #31 |
| 33 | verifyWebhook.js:23 | dup | same | webhook-hmac-disabled | dup of #31 |
| 34 | subscribeSyncProducts.js:27 | real | `subscribeSyncProducts` (Pub/Sub handler) | shop-doc-in-pubsub | pubsub/subscribeSyncProducts.js:10-27 re-publishes `{shop, cursor, historyId}` to topic `syncProducts` on every pagination page, `shop` is whatever raw doc it received — never stripped |
| 35 | bulkGenerateProcessRepository.js:14 | real | `createProcess` | body-controlled-ownership-fields | bulkGenerateProcessRepository.js:13-15 `collection.add({shopId, isDone:false, ...data, createdAt})` — `...data` spreads AFTER `shopId`, so a body-supplied `data.shopId` (generatorController passes `createData = {...ctx.req.body.data}` verbatim) overrides the real owner |
| 36 | templateRepository.js:39 | real | `updateOrCreateByShopId` (via `POST /templates` → `templateController.createOne`) | body-controlled-ownership-fields | templateRepository.js:32-46; templateController.js:34-38 passes `templateData = ctx.req.body` straight through; repo does `collection.doc(templateData.id).update(template)` with zero check that the existing doc's `shopId` matches the caller — overwrites content AND re-parents `shopId` to the attacker's session shop |
| 37 | templateRepository.js:40 | dup | same | body-controlled-ownership-fields | dup of #36 |
| 38 | routes/extension.js:6 | dup | `POST /extension/flow/*` | unauthenticated-extension-routes | dup of #13 — this file is just the router mount (`cors()` only, no auth middleware), the vulnerable logic is in flowController.js |
| 39 | crisp.js:4 | real | `services/config/crisp.js` default export | committed-credentials | config/crisp.js:4-7 `website_id`/`identifier`/`key`/`session_id` all hardcoded |
| 40 | crisp.js:5 | dup | same | committed-credentials | dup of #39 |
| 41 | crisp.js:6 | dup | same | committed-credentials | dup of #39 |
| 42 | errorService.js:13 | real | `errorService.handleError` (bound via `api.on('error', ...)` in handlers/api.js:81 and apiSa.js:48) | secret-in-error-log | errorService.js:8-13 `logger.error('[handleError]', shopId, err)` — `err` is the raw error object; `logger.js:23` does `console.error(...args)` with no redaction, so any uncaught axios error (e.g. `.config.headers` carrying `X-Shopify-Access-Token` from `helpers/api.js:38-43`) gets serialized whole into Cloud Logging |
| 43 | seoService.js:32 | real | `checkInstallSEO` | secret-in-error-log | seoService.js:13-32 catches the axios error from `api()` (helpers/api.js:16-25, bare `axios.create()`) and logs it raw; the request set `'X-SEO-Access-Token': accessToken` (line 19), which axios attaches to the thrown error's `.config.headers` |
| 44 | shopifyService.js:697 | dup | `startBulkProductExport` | shop-doc-in-pubsub | line drift — 697 lands mid-`createCollection`, unrelated; the described behavior is `startBulkProductExport` at line 733-735, same as #45 |
| 45 | shopifyService.js:735 | real | `startBulkProductExport` | shop-doc-in-pubsub | shopifyService.js:733-735 `publishTopic('syncProducts', {shop, historyId})`; `shop` comes from `installationService.syncShop`'s `getShopByField` (shopRepository.js:52-62), which returns the **raw** doc (`{id, ...doc.data()}`) — not the `presentShop()` (shopPresenter.js:6-9) path that strips `accessToken`/`accessTokenHash`. Confirms the field is real and sensitive: `presentShop` exists specifically to strip it. |

## Root-cause groups (23 real findings → 12 fix units)

1. **committed-credentials** (ROTATE) — `.npmrc:1` + `packages/functions/.npmrc:1` (npm registry token, same value, both files), `const/appIntegationKeys.js:1` (AVADA_SEO_PRO_ACCESS_TOKEN), `graphql/codegen.js:7` (Shopify `shpua_` token), `commands/autoTranslateV2.js:8` (Google Translate API key), `services/config/crisp.js:4-7` (Crisp identifier/key/website_id/session_id — 4 credential fields, one blob).
   Fix: rotate all 5 credential types, move to env/secret manager, `git filter-repo`/BFG if history must be scrubbed. No auth-boundary or schema change — straightforward.

2. **client-bundled-secrets** — `AppBadgeBranch.jsx` (VITE_RELEASE_API_TOKEN), `SeoLegacyPlanModal.jsx` (imports the same AVADA_SEO_PRO_ACCESS_TOKEN from group 1 into the Vite frontend bundle via the `@functions`→`packages/functions/src` alias).
   Fix: never import `@functions/const/*` from `packages/assets`; proxy the SEO-install check and the release-trigger through a backend endpoint that holds the token server-side. Depends on rotating the token in group 1 first. No migration, but touches the trust boundary between the two packages — **needs-opus** for the assets/functions boundary redesign.

3. **open-firestore-rules** — `firestore.rules:7-27`, six collections (`bulkGenerateProcesses`, `resultGen`, `analytics`, `credits`, `historySyncData`, `translateProcesses`) readable by anyone, three also world-writable, read directly by the client Firebase SDK.
   Fix: scope every rule to `request.auth` + shopId match, or drop client SDK reads entirely in favor of the API. Auth-boundary change — **needs-opus**, and any existing shop that depends on direct-read behavior needs a compat check before flipping to `if false`.

4. **unauthenticated-extension-routes** — `flowController.js` (`generate`, `generateProductSeoDesc`), `routes/extension.js` (mount point).
   Fix: verify the Shopify Flow extension's signed payload (or at minimum an HMAC/shared secret) before trusting `shopify_domain`; currently only `cors()` guards the router. Auth-boundary change — **needs-opus**.

5. **unowned-process-mutation** — `generatorController.js:90-91` (`isRegenerate` branch) + `bulkGenerateProcessRepository.js:114-123` (`updateRegenerateProcess`).
   Fix: same pattern already fixed for `publish`/`cancelProcess`/`reOptimize` (`ownedProcess.shopId !== shop.id` check) — port that guard into `updateRegenerateProcess` before it reads/deletes `result` items. Mechanical, no migration.

6. **untrusted-credit-math** — `creditGuardMiddleware.js:26-64` (gate + deduct trust body `creditCost`) and `generatorController.js:104-153` (process-creation `creditCost` computed from body `model`).
   Fix: recompute `creditCost` server-side from `model` + a server-counted quantity in `creditGuardMiddleware` itself (there's already a `computeCreditCost` helper used elsewhere — reuse it here instead of trusting the body number). Needs a coordinated change across the middleware and the two `createProcess` call sites so the stored `process.creditCost` ceiling and the amount actually charged agree. Auth-adjacent (money), no schema migration — **needs-opus** for review given it's a billing-integrity fix, not just an authz check.

7. **body-controlled-ownership-fields** — `settingsController.js:36-40` + `settingsRepository.js:19-31`, `shopController.js` not this group (see #8), `bulkGenerateProcessRepository.js:13-15` (`createProcess`), `templateRepository.js:32-46` + `templateController.js:34-38`.
   Fix: whitelist (`pick`) the fields taken from the request body before every Firestore write that includes `shopId`/document `id` from the client; never let `...data` spread after or alongside `shopId`. Same shape as `shopController.update`'s existing `pick()` — that's the pattern to copy. Mechanical per call site, no migration.

8. **self-grant-entitlement-flags** — `shopController.js:59-68` (`update`).
   Fix: split `updateData` into a merchant-editable subset (`setupDone`, `keepTemplateStructure`, `isEvaluate`, `syncDone`, `adminLocale`) and a staff/webhook-only subset (`noLimit`, `enablePro`, `enableGpt41`); drop the latter from `pick()` on this route and set them only from `subscriptionService`/staff tooling. No migration.

9. **url-param-shop-resolution** — `shopifyController.js:115-119` (`syncData`) + `installationService.js:94-113` (`syncShop`).
   Fix: resolve the target shop from the authenticated session (`authentication.getShop(ctx)`), drop `ctx.params.shopifyDomain` as the lookup key, or at minimum assert it equals the session shop's domain before calling `syncShop`. Auth-boundary change — **needs-opus**.

10. **credential-in-querystring** — `swaggerAuth.js:26-27` (`exchangeToken`) + `routes/proxy.js:10` (mount).
    Fix: accept the integration key via header (`Authorization: Bearer <key>` or a custom header) instead of `?accessToken=`; keep query-string support only as a deprecated fallback if partner tooling needs a grace period. Independent of the already-fixed FAL-720 shop-binding issue. No migration.

11. **webhook-hmac-disabled** — `middleware/webhook/verifyWebhook.js:12-23`.
    Fix: uncomment and wire the HMAC check against `shopifyConfig.secret` using the raw body, same as every other Avada app; the commented block is already correct code, just dead. Mechanical, no migration — but flip carefully since `webhookCreateProduct`/`webhookBulkOperation` currently accept any POST and something may be relying on that in staging.

12. **secret-in-error-log** — `services/errorService.js:8-13` (`handleError`, wired via `api.on('error', ...)`) + `services/seoService.js:13-32` (`checkInstallSEO`) + the shared unredacted `helpers/logger.js:22-24` (`console.error(...args)`).
    Fix: redact `err.config?.headers` / `err.request` before logging anywhere an axios error can surface, ideally centralized in `logger.js` itself (strip known credential header names) rather than patched per call site — there are likely more than these two call sites given `helpers/api.js` is used broadly. No migration.

**Separately, part of shop-doc-in-pubsub group (13th group):**
`services/shopifyService.js:733-735` (`startBulkProductExport`) + `pubsub/subscribeSyncProducts.js:10-27` — full raw shop doc (via `getShopByField`, not the `presentShop()`-stripped path) published to Pub/Sub topic `syncProducts` and re-published on every pagination page.
Fix: strip `accessToken`/`accessTokenHash` before publishing (`presentShop()` already exists for exactly this — use it, or pass `shop.id` and re-fetch server-side inside the subscriber). Mechanical, no migration — but touches every consumer of that topic, so needs a check for anything downstream that currently relies on the accessToken being present in the message (if so, re-fetch inside the handler instead of stripping blindly).
