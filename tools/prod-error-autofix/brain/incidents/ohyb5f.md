fingerprint: ohyb5f
service: api
message: [syncShopDataFromShopify] 0KAAXCMQdTIjJX3GASGK RequestError: socket hang up
app: BLOG
repo: blogs
date: 2026-09-08T08:32:01.531Z
status: fix_disabled
attempt: 1

# BLOG · api · ohyb5f

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Shopify's Admin API reset the TLS connection (ECONNRESET, "socket hang up") on one of the two bare `initShopify(shopFromDB).graphql(...)` calls inside syncShopDataFromShopify, which has no retry wrapper; its catch logs the alerted ERROR and rethrows into the un-`.catch()`-ed fire-and-forget call at after-login.service.js:24, and that rejection killed the in-flight GET /api/shops with a 500.

**Mechanism.** GET /api/shops (embedded-app login) runs @avada/core's verifyEmbedRequest → afterLoginService, which fires `void syncShopDataFromShopify(shop.id)` at after-login.service.js:24 with no `.catch()` — unlike its three siblings on lines 25, 30 and 37, which all attach one. syncShopDataFromShopify issues its two shop/onlineStore queries through `initShopify()` (shopifyService.js:26-31: `new Shopify({apiVersion, accessToken, shopName, autoLimit:true})` — no retry, no timeout), i.e. shopify-api-node's got client; the logged stack is `got/dist/source/core/index.js:970` with `error.code: "ECONNRESET"`, so the failure is a reset Admin API socket, not app logic. shop.service.js:129-131 logs `[syncShopDataFromShopify] 0KAAXCMQdTIjJX3GASGK RequestError: socket hang up` at 08:25:29.499564Z and then `throw e`. Nothing is attached to that promise, and the stack carries Cloud Functions' per-request domain frames (`node:domain:489:12`, `node:domain:552:15`), so the rejection is delivered to the runtime's request domain rather than to the app's own `process.on('unhandledRejection')` listener: the runtime printed the bare stack to stderr at 08:25:29.499897Z (textPayload, no severity, no tag) and failed the request the instance was serving. That request is the single 500: GET /api/shops, started 08:25:29.095421Z, latency 0.403977988s → ended 08:25:29.4994Z, same instance 00a41e8c1dc5cf…, same revision api-00168-guy — 164 µs before the logged ERROR. It never went through the Koa chain: zero `[unhandledError]` (middleware/errorHandler.js:17) and zero `[handleError]` (errorService.js:12) entries exist in the 36h from 2026-09-07T00:00Z, so no middleware ever saw the error. ECONNRESET is already in RETRYABLE_CODES (helpers/api.js:137-144), so the same call issued through makeGraphQlApi would have retried and never surfaced.

Confidence: `high`

## Code
- `packages/functions/src/services/after-login.service.js:24` — `void syncShopDataFromShopify(shop.id)` — the only fire-and-forget in afterLoginService with no `.catch()`; lines 25/30/37 all have one
- `packages/functions/src/services/shop.service.js:83` — first bare `initShopify(shopFromDB).graphql(...)` — the unretried Admin API call that got the socket hang up (second at line 95)
- `packages/functions/src/services/shop.service.js:130` — logger.error that emitted the exact alerted line, tag [syncShopDataFromShopify], shopId 0KAAXCMQdTIjJX3GASGK
- `packages/functions/src/services/shop.service.js:131` — `throw e` after logging — turns a handled transient upstream blip into an unattached rejection
- `packages/functions/src/services/shopifyService.js:26` — initShopify builds shopify-api-node (got) with autoLimit only — no retry, no timeout
- `packages/functions/src/helpers/api.js:137` — RETRYABLE_CODES already includes ECONNRESET; makeGraphQlApi/shopifyRetryGraphQL would have retried this exact failure
- `packages/functions/src/middleware/errorHandler.js:17` — the [unhandledError] log that a 5xx through the Koa chain would have produced — absent for this 500

## Evidence
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-08T08:10:31Z" AND timestamp<="2026-09-08T08:40:31Z" AND jsonPayload.message:"[syncShopDataFromShopify]"`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-08T08:10:31Z" AND timestamp<="2026-09-08T08:40:31Z" AND textPayload:"socket hang up"`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-08T08:10:31Z" AND timestamp<="2026-09-08T08:40:31Z" AND httpRequest.status>=500`
- 4 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-08T08:10:31Z" AND timestamp<="2026-09-08T08:40:31Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $3.40

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
