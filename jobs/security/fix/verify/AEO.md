# AEO security findings — verification

ref: `origin/main` @ `7cab2d5` (llm-ai-search-seo). Local checkout was on a feature branch — ignored, all reads via `git show origin/main:<path>`.

counts: 34 rows total — **real 13, dup 19, already-fixed 2, refuted 0**.

## Row-by-row verdicts

| # | file:line | category | verdict | anchor | group | evidence |
|---|---|---|---|---|---|---|
| 1 | .npmrc:1 | secret | **real** | .npmrc | G9 committed creds | `//registry.avada.io/:_authToken="..."` literal token, .npmrc:1 |
| 2 | .yarnrc.yml:8 | secret | **dup** of #1 | .yarnrc.yml | G9 | `npmAuthToken:` — same registry.avada.io token, second copy |
| 3 | firebase.storage.rules:5 | authn | **real** | firebase.storage.rules | G8 open storage rules | `match /blog-media/{shopId}/{image} { allow read, write; }` :5, and `/featureReq/{document} { allow read, write: if true; }` :8 — both unauthenticated |
| 4 | packages/functions/src/commands/autoTranslateV2.js:8 | secret | **already-fixed** | — | — | GOOGLE_API_KEY now `process.env.AUTO_TRANSLATE_GOOGLE_API_KEY` with a hard `throw` if unset; comment cites FAL-763 rotation, no literal key present :8-13 |
| 5 | packages/functions/src/config/changelog.js:11 | credential_exposure | **real** | changelogTriggers (registerV1) | G4 changelog no field mask | `registerV1({collections:[{collectionId:'shops'}, ...]})` :9-14, no `destinations`/`pickKeys` → SDK default (`node_modules/firestore-bigquery-changelog/lib/utils.js:42-43`) does `data: JSON.stringify(currentData)`, full doc incl. accessTokenHash/passwordStore |
| 6 | packages/functions/src/config/pickFields.js:45 | credential_exposure | **dup** of #15 | pickFields | G2 passwordStore via /proxy/shop | `'passwordStore'` in `pickFields` array :45, consumed by `prepareShop()` → `getShopProxy` |
| 7 | packages/functions/src/config/pickFields.js:57 | credential_exposure | **dup** of #32 | blockFields | G7 shopifyDomain hijack | `blockFields = ['plan','isDevZone','installedAt']` :57 — `shopifyDomain` absent |
| 8 | packages/functions/src/const/appIntegationKeys.js:1 | secret | **real** | appIntegationKeys.js | G9 committed creds (also underlies G1) | 3 literal tokens (SEO ON staging/prod, SEO Pro) :1-3 |
| 9 | packages/functions/src/controllers/competitorsController.js:52 | shop_scoping | **real** | `DELETE /api/competitors` (`remove`) | G6 competitors unscoped | `const {id} = ctx.req.body; ... await removeCompetitor(id);` :52-54, no shop check; `addCompetitor` also never stamps a shop id |
| 10 | packages/functions/src/controllers/linksController.js:24 | credential_exposure | **real** | `sync()` → `POST /api/links/sync` | G5 shop object to Pub/Sub | `await publishTopic('syncLinks', {shop});` :24, `shop = getShopById(shopID)` from `@avada/core`, which always re-attaches `accessTokenHash` (`node_modules/@avada/core/build/repositories/shopRepository.js` `prepareShopData`). Same pattern repeats in `startSyncProxy`'s v1 branch. |
| 11 | packages/functions/src/controllers/linksController.js:63 | shop_scoping | **dup** of #24(validateAccessToken.js:42) | `startSyncProxy`/`stopSyncProxy`/`getSyncStatusProxy` | G1 | shop resolved via `ctx.get('X-SEO-Shop-Domain')` :50/97/133, gated only by the global `validateAccessToken` middleware |
| 12 | packages/functions/src/controllers/shopController.js:152 | shop_scoping | **dup** of #23(validateAccessToken.js:42) | `updateShopProxy` | G1 | header-resolved shop inside `updateShopProxy`, same copy-pasted block across all `/proxy/*` handlers |
| 13 | packages/functions/src/controllers/shopController.js:153 | shop_scoping | **dup** of #23 | `updateShopProxy` | G1 | same block, adjacent line |
| 14 | packages/functions/src/controllers/shopController.js:158 | shop_scoping | **dup** of #23 | `updateShopProxy` | G1 | `updateShopData(shop.id, ctx.req.body)` :169 — write consequence of header-resolved shop, same root cause |
| 15 | packages/functions/src/controllers/shopController.js:192 | credential_exposure | **real** | `getShopProxy` → `GET /proxy/shop` | G2 | `ctx.body = {success:true, data: prepareShop({shop})}` :209 — `prepareShop` applies `pickFields` (includes `passwordStore`, `crispSessionToken`) with **no** `HIDDEN_FROM_INTERNAL_KEY`-style filter (that filter exists only in the separate `getShop` handler, :74/84-90, and only applies when `ctx.state.internal` is true) |
| 16 | packages/functions/src/controllers/shopController.js:198 | credential_exposure | **dup** of #15 | `getShopProxy` | G2 | same response object, same missing filter |
| 17 | packages/functions/src/graphql/codegen.js:7 | secret | **already-fixed** | — | — | `ACCESS_TOKEN = process.env.ACCESS_TOKEN`, throws if unset :12-14; comment cites FAL-763, no literal token remains |
| 18 | packages/functions/src/handlers/webhook/bulkOperationWebhook.js:43 | shop_scoping | **dup** of #26(webhookMiddleware.js:19) | `handleHook` / `POST /webhook/bulk-operation` | G3 webhook HMAC disabled | `getShopByField(shopifyDomain)` :43 where `shopifyDomain = req.header('X-Shopify-Shop-Domain')` :27 — exploitable only because `verifyWebhook` performs no verification at all |
| 19 | packages/functions/src/middleware/swaggerAuth.js:14 | credential_exposure | **real** | `exchangeToken` → `GET /proxy/swagger-token` | G1 | `ctx.query.shop` / `ctx.query.accessToken` (actual lines 57-58, drifted from claimed 14) — token+domain read from URL query string on a GET route |
| 20 | packages/functions/src/middleware/swaggerAuth.js:44 | shop_scoping | **dup** of #19 | `exchangeToken` | G1 | `getIntegrationKey(accessToken)` (actual line 81) only checks the token exists; `integrationKeys` docs carry no shop field (`integrationRepository.js` — `name,type,accessToken` only) |
| 21 | packages/functions/src/middleware/swaggerAuth.js:52 | shop_scoping | **dup** of #19 | `exchangeToken` | G1 | `jwt.sign({shopID, shopifyDomain, integrationId}, ...)` (actual lines 96-97) mints a session for whatever `shopID` was resolved from the client-supplied `?shop=`, unrelated to the token's identity |
| 22 | packages/functions/src/middleware/swaggerAuth.js:59 | credential_exposure | **dup** of #19 | `exchangeToken` | G1 | same as above |
| 23 | packages/functions/src/middleware/validateAccessToken.js:42 | shop_scoping | **real** | `validateAccessToken` middleware | G1 | `getIntegrationKey(accessToken)` :42 — token existence check only, no binding to `shopifyDomain` from the header |
| 24 | packages/functions/src/middleware/validateAccessToken.js:46 | shop_scoping | **dup** of #23 | `validateAccessToken` | G1 | `if (!integration) {...}` :46 — same check |
| 25 | packages/functions/src/middleware/validateAccessToken.js:58 | shop_scoping | **dup** of #23 | `validateAccessToken` | G1 | `ctx.state.integration = integration;` :58 — global integration attached, `next()` called regardless of which shop the header names |
| 26 | packages/functions/src/middleware/webhook/webhookMiddleware.js:14 | authn | **dup** of #29 | `verifyWebhook` | G3 | HMAC block commented out :15-24 |
| 27 | packages/functions/src/middleware/webhook/webhookMiddleware.js:15 | authn | **dup** of #29 | `verifyWebhook` | G3 | same commented block |
| 28 | packages/functions/src/middleware/webhook/webhookMiddleware.js:19 | authn | **real** | `verifyWebhook` (default export) | G3 | `// if (req.get('X-Shopify-Hmac-Sha256') !== generatedHash ...)` :20-24 — check fully commented out, function unconditionally `return next();` :26 |
| 29 | packages/functions/src/middleware/webhook/webhookMiddleware.js:20 | authn | **dup** of #28 | `verifyWebhook` | G3 | same block |
| 30 | packages/functions/src/middleware/webhook/webhookMiddleware.js:26 | authn | **dup** of #28 | `verifyWebhook` | G3 | `return next();` :26 — unconditional pass-through |
| 31 | packages/functions/src/repositories/competitorsRepository.js:33 | shop_scoping | **real** | `getCompetitors()` → `GET /api/competitors` | G6 | `collection.get()` :33, no `.where(shopId...)` — returns every shop's competitor rows to any authenticated shop session |
| 32 | packages/functions/src/repositories/shopRepository.js:94 | untrusted_input | **real** | `updateShopData` → `PUT/POST /api/shop` | G7 | `const fieldsToStrip = postData?.isDevZone ? ['isDevZone'] : blockFields;` :94 — `shopifyDomain` never blocked, and when the client sends `isDevZone` the strip list collapses to just that one field, also unblocking `plan`. `@avada/core`'s `lookupRawShop` resolves shops for OAuth/install purely by `where('shopifyDomain','==',shop).limit(1)` (`node_modules/@avada/core/build/repositories/shopRepository.js:220`) — first doc claiming a domain wins future token writes |
| 33 | packages/functions/src/routes/proxy.js:15 | authn | **dup** of #19 | route wiring for `GET /proxy/swagger-token` | G1 | `router.get('/swagger-token', exchangeToken);` :16 (actual), no middleware ahead of it — by design, `exchangeToken` does its own check, which is the broken one |
| 34 | packages/functions/src/services/config/crisp.js:6 | secret | **real** | crisp.js | G9 committed creds | `website_id`, `identifier`, `key`, `session_id` literals :4-7 |

## ROOT-CAUSE GROUPS (real findings)

**G1 — integration key is shared, not bound to a shop** (needs-opus, needs-migration)
Files: `middleware/validateAccessToken.js`, `middleware/swaggerAuth.js` (`exchangeToken`), `routes/proxy.js`, `controllers/shopController.js` (5 proxy handlers), `controllers/linksController.js` (3 proxy handlers), `repositories/integrationRepository.js` (`integrationKeys` docs have no shop field at all).
Fix direction: add a shop-binding field to `integrationKeys` (or a per-shop-issued token scheme) and check it in `validateAccessToken` + `exchangeToken` against the caller-supplied domain; stop accepting the shop identity purely from `X-SEO-Shop-Domain` / `?shop=`. Touches the auth boundary directly — every `/proxy/*` route trusts this middleware. Needs a data migration (existing `integrationKeys` docs get a shop/scope field, or move to per-shop tokens) and a rollout plan since a real bot integration is a legitimate caller of these routes today (not a case of "make it private" — it must stay callable by the bot, just properly scoped).
This matches the team's known fleet-wide issue (`integration-key-unbound-fleetwide.md`, FAL-720) — AEO is one of the 4 apps not yet patched.

**G2 — `GET /proxy/shop` leaks passwordStore/crispSessionToken** (needs-opus)
Files: `config/pickFields.js`, `controllers/shopController.js` (`getShopProxy`).
Fix direction: apply the same field-hiding the `getShop` handler already does for internal callers (`HIDDEN_FROM_INTERNAL_KEY`) to `getShopProxy`'s response, or drop `passwordStore`/`crispSessionToken` from `pickFields` entirely for any bot-reachable path. Compounds with G1 — even once G1 is fixed (token bound to its own shop), a merchant's own integration token would still see its own password in cleartext unless this is also filtered.

**G3 — Shopify webhook HMAC verification is disabled** (needs-opus)
Files: `middleware/webhook/webhookMiddleware.js` (`verifyWebhook`), `handlers/webhook/bulkOperationWebhook.js`.
Fix direction: uncomment and enable the `X-Shopify-Hmac-Sha256` check against `req.rawBody` (verify `rawBody` capture is actually wired for this route before re-enabling). Legitimate caller: Shopify's own webhook delivery — this route is *supposed* to be reachable without a session, but must verify the signature; currently anyone can POST with a spoofed `X-Shopify-Shop-Domain` and drive `handleHook` for an arbitrary shop.

**G4 — `shops` Firestore→BigQuery changelog mirrors the full document** (needs-migration)
Files: `config/changelog.js`.
Fix direction: add `destinations: [{pickKeys: [...safe fields...]}]` (or a `transformRow`) to strip `accessTokenHash`, `accessToken`, `passwordStore`, `crispSessionToken` before they reach BigQuery. Needs a migration/cleanup pass on the BigQuery table too — rows already written contain these fields historically; existing exposure needs a retroactive scrub/ACL review, not just a code fix.

**G5 — full shop record (incl. accessTokenHash) published to the `syncLinks` Pub/Sub topic**
Files: `controllers/linksController.js` (`sync`, and `startSyncProxy`'s v1 branch).
Fix direction: publish only the fields the `syncLinks` subscriber actually needs (id/shopifyDomain), not the whole `getShopById()` object. Lower urgency than the HTTP-facing groups — blast radius is limited to whoever holds `pubsub.subscriber` in the GCP project, not the public internet.

**G6 — competitors collection has no shop scoping anywhere** (needs-opus, needs-migration)
Files: `controllers/competitorsController.js` (`add`/`list`/`remove`), `repositories/competitorsRepository.js`.
Fix direction: stamp `shopId` on `addCompetitor`, filter `getCompetitors`/`removeCompetitor` by the caller's own `shopId` (from `getCurrentShop(ctx)`). Needs a migration to backfill/assign existing competitor docs to an owning shop — currently none carry one, so today's docs may need to be re-attributed by best-effort or discarded. Session-gated (any authenticated embedded-app shop, not literally public), but cross-tenant: any of the installed merchants can currently read and delete every other merchant's rows.

**G7 — `PUT/POST /api/shop` can rewrite `shopifyDomain`** (needs-opus)
Files: `repositories/shopRepository.js` (`updateShopData`), `config/pickFields.js` (`blockFields`).
Fix direction: add `shopifyDomain` to `blockFields` (it should never be client-writable post-install), and fix the `isDevZone` branch so it always strips `blockFields` too, not just `['isDevZone']` — currently sending `isDevZone` in the body also unblocks `plan`. Real exploit chain confirmed via `@avada/core`'s `lookupRawShop`, which resolves shops for OAuth/install purely by a `shopifyDomain` field match — first doc to claim a domain wins that domain's next token write.

**G8 — Firebase Storage rules allow unauthenticated read+write** (needs-opus)
Files: `firebase.storage.rules`.
Fix direction: require `request.auth != null` (or a signed/shop-scoped claim) on writes to `/blog-media/{shopId}/{image}` and `/featureReq/{document}`; `/featureReq` write should not be `if true`. Public **read** on `/blog-media` may be intentional (storefront-facing images act like a CDN) — no route in this repo showed a legitimate need for anonymous **write** to either path.

**G9 — committed credentials (ROTATE)**
- `.npmrc:1` / `.yarnrc.yml:8` — private npm registry (registry.avada.io) auth token, committed twice. **ROTATE**
- `packages/functions/src/const/appIntegationKeys.js:1` — 3 sister-app integration access tokens (SEO ON staging, SEO ON prod, SEO Pro). **ROTATE**
- `packages/functions/src/services/config/crisp.js:6` — Crisp plugin website_id/identifier/key/session_id. **ROTATE**
Not included here (already remediated per code): `autoTranslateV2.js:8` (Google Translate API key) and `graphql/codegen.js:7` (Shopify user access token) both now require the value via env var and throw if missing, per FAL-763 comments in both files — the values that were previously committed are still burned and should be confirmed rotated operationally, but the code defect is fixed.
