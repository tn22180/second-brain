fingerprint: 15yxvhj
service: api
message: [syncShopDataFromShopify] zPuTXs5VzTqRK5gAO2yH RequestError: Timeout awaiting 'request' for 60000ms
app: BLOG
repo: blogs
date: 2026-10-05T01:53:09.787Z
status: fix_disabled
attempt: 1

# BLOG · api · 15yxvhj

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** The fire-and-forget `void syncShopDataFromShopify(shop.id)` in afterLoginService is the only voided call in that function without a `.catch`, and the function rethrows; when its Shopify Admin GraphQL POST hit shopify-api-node's default 60000ms got timeout, the floating rejection surfaced inside the in-flight GET /api/shops request's node domain and turned it into the 500 with 60.446s latency.

**Mechanism.** verifyToken only awaits afterLogin for `GET /api/shops` (node_modules/@avada/core/build/helpers/verifyEmbedRequest/verifyToken.js:85-87, apiShopPath defaults to '/api/shops'), so afterLoginService runs inside that request. At after-login.service.js:24 it calls `void syncShopDataFromShopify(shop.id)` with no `.catch` — unlike every sibling voided call on lines 25, 30 and 37, which all attach one. syncShopDataFromShopify issues two parallel `initShopify(shopFromDB).graphql(...)` calls (shop.service.js:82-95); initShopify builds `new Shopify({apiVersion, accessToken, shopName, autoLimit: true})` with no `timeout` (shopifyService.js:27), so shopify-api-node's own default `timeout: 60000` (node_modules/shopify-api-node/index.js:65, handed to got at index.js:286) is the deadline. One of those two POSTs never answered: got raised `RequestError: Timeout awaiting 'request' for 60000ms` (code ETIMEDOUT, name TimeoutError), the catch at shop.service.js:130 logged `[syncShopDataFromShopify] zPuTXs5VzTqRK5gAO2yH …` at severity=ERROR — the alerted line verbatim — and line 131 rethrew into a promise nobody holds.

The timing ties the rejection to the 500 to sub-millisecond: the request log's `timestamp` is the request START (2026-10-03T21:06:58.864232Z, receiveTimestamp 21:07:59.542 = when it was written at the end), latency 60.446048843s → request ended 21:07:59.3103, and the got TimeoutError was logged at 21:07:59.309722. The error stack carries `at ClientRequest.emit (node:domain:489:12)` and `at TLSSocket.emit (node:domain:489:12)` — the request's active node domain — which is how a rejection from a non-awaited promise is charged back to the request that started it and answered 500. Corroborating: the four unrelated `read ETIMEDOUT` failures at 21:06:37–21:06:49 landed as `Exception from a finished function` (response already sent), while this one produced no such prefix, just a bare stack at 21:07:59.317868 under the same execution_id svudv9qeo8r4 — i.e. it was still in flight.

What the logs do NOT show: why the request was still in flight at +60.4s instead of its usual 0.64–2.13s (15 /api/shops requests in 21:00–21:15, 14 of them 200 at ≤2.13s). The most likely unlogged candidate is getUserShops' awaited `getCrmWidgets(shopId)` (shopController.js:43 → widgetService.js:70), which calls `api()` on an axios instance created with no timeout (helpers/api.js:9) wrapped in a 1-retry `withRetry` whose failure only logs after the retry — an unanswered public.avada.io socket there hangs silently and indefinitely. That part is a hypothesis, not evidence: no `[getCrmWidgets]` or `[fetchGhConfig]` warn exists in the window. What is proven is the terminating event, not the stall.

Confidence: `medium`

## Code
- `packages/functions/src/services/after-login.service.js:24` — `void syncShopDataFromShopify(shop.id);` — the only voided call in afterLoginService with no `.catch`, so its rejection has no handler and is routed into the request's node domain. Lines 25, 30 and 37 all attach `.catch`.
- `packages/functions/src/services/shop.service.js:130` — `logger.error('[syncShopDataFromShopify]', shopId, e)` produces the alerted line verbatim, including shop id zPuTXs5VzTqRK5gAO2yH and jsonPayload.tag '[syncShopDataFromShopify]'.
- `packages/functions/src/services/shop.service.js:131` — `throw e;` — rethrowing after logging is what converts a swallowed background failure into an unhandled rejection, given the call site on line 24 of after-login.service.js.
- `packages/functions/src/services/shop.service.js:83` — `initShopify(shopFromDB).graphql(...)` — one of the two parallel Admin GraphQL POSTs, issued through a bare client with no retry and no per-request deadline; this is what got timed out at 60000ms.
- `packages/functions/src/services/shopifyService.js:27` — initShopify constructs `new Shopify({apiVersion, accessToken, shopName, autoLimit: true})` with no `timeout`, so shopify-api-node's 60000ms default is the deadline that fired; autoLimit only paces the REST leaky bucket, it does not bound a slow response.
- `packages/functions/src/controllers/shopController.js:43` — getUserShops awaits `getCrmWidgets(shopId)` in the /api/shops critical path — the unbounded outbound call that best explains the unlogged 60s stall, unproven.
- `packages/functions/src/helpers/api.js:9` — `const client = axios.create();` — no `timeout`, so axios defaults to 0 (no timeout): every `api()` caller, including getCrmWidgets, can hang a request indefinitely with no log line.

## Evidence
- 1 matching entries: `(resource.labels.service_name="api") AND jsonPayload.tag="[syncShopDataFromShopify]" AND timestamp>="2026-10-03T20:53:01.663Z" AND timestamp<="2026-10-03T21:23:01.663Z"`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.service_name="apiv2" OR resource.labels.service_name="apisa") AND jsonPayload.tag="[syncShopDataFromShopify]" AND timestamp>="2026-09-26T00:00:00Z" AND timestamp<="2026-10-05T00:00:00Z"`
- 2 matching entries: `resource.labels.service_name="api" AND httpRequest.requestUrl:"/api/shops" AND httpRequest.status>=500 AND timestamp>="2026-09-26T00:00:00Z" AND timestamp<="2026-10-05T00:00:00Z"`
- 1 matching entries: `resource.labels.service_name="api" AND textPayload:"Timeout awaiting" AND timestamp>="2026-10-03T20:53:01.663Z" AND timestamp<="2026-10-03T21:23:01.663Z"`
- 15 matching entries: `resource.labels.service_name="api" AND httpRequest.requestUrl:"/api/shops" AND timestamp>="2026-10-03T21:00:00Z" AND timestamp<="2026-10-03T21:15:00Z"`

## Job
- analyze rounds: 1
- cost: $2.55

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
