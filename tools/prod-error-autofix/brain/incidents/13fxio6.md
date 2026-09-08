fingerprint: 13fxio6
service: api
message: [setupTemplates] HTTPError: Response code 500 (Internal Server Error)
app: BLOG
repo: blogs
date: 2026-09-08T02:00:24.474Z
status: fix_disabled
attempt: 1

# BLOG · api · 13fxio6

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Duplicate of recorded fingerprint 4nac83 (same 30-min window, same instance 00a41e8c1d6dd670, revision api-00166-zis): the alerted [setupTemplates] line is a swallowed non-fatal symptom of a ~4-minute Shopify Admin API 500/503 brownout (08:35:13–08:39:09Z plus a tail at 08:46:24–25Z), while the window's 3 HTTP 500s on GET /api/shops come from the one fire-and-forget call in afterLoginService with no .catch() — `void syncShopDataFromShopify(shop.id)` — whose rethrow becomes an unhandled promise rejection the functions-framework turns into a 500.

**Mechanism.** Shopify Admin returned 500/503 to this instance for the whole window (25 [shopifyRetryGraphQL] attempt failures: 21× 500, 4× 503, first 08:35:13.470813Z, last 08:39:08.935817Z). Two independent paths consumed that fault. (a) The alerted path is inert: getMainThemeId logs `[getMainThemeId] e.message` at shopifyService.js:704 and rethrows at :705; it did not retry because shopifyRetryError's code list at shopifyService.js:160 is [429,430,502,503] and excludes 500. setupTemplates' outer catch at after-login.service.js:116 logs `[setupTemplates] e.message` and swallows, so its promise resolves and the caller's `.catch()` at after-login.service.js:37 never fires — nothing propagates. Proof of the pairing: all 3 [setupTemplates] lines (08:35:22.737721Z, 08:36:24.511120Z, 08:37:56.179173Z) follow a [getMainThemeId] line by ≤0.13 ms, and none of the three coincides with a 500. (b) The real 500s come from after-login.service.js:24, the only `void` call in afterLoginService without a `.catch()` — its siblings at lines 25, 30 and 37 all have one. syncShopDataFromShopify issues two bare `initShopify(shopFromDB).graphql(...)` calls (shop.service.js:83 and :95) through shopify-api-node's got client with no shopifyRetryGraphQL/makeGraphQlApi wrapper, so Shopify's 500 surfaces as `HTTPError: Response code 500` from got/as-promise/index.js:118, is logged at shop.service.js:130 and rethrown at shop.service.js:131 into a floating promise. Each of the 3 request-log 500s ends (start + latency) within 13 ms of a [syncShopDataFromShopify] error line: 08:35:21.378491Z+0.682930s=08:35:22.061 vs 08:35:22.061141Z; 08:46:24.108592Z+0.925136s=08:46:25.034 vs 08:46:25.047110Z; 08:46:25.188516Z+0.457595s=08:46:25.646 vs 08:46:25.646415Z. The 4th sync rejection (08:35:22.774904Z, second graphql call of the same shop) landed after its request had already finished and is followed 102 µs later by the functions-framework line `Exception from a finished function: HTTPError: Response code 500` at 08:35:22.775006Z. Koa never saw these: errorHandler.js:17 logs `[unhandledError]` for every >=500 it catches, and the window's single such line is for GET /api/article/630397731103, not /api/shops.

Confidence: `medium`

## Code
- `packages/functions/src/services/after-login.service.js:24` — `void syncShopDataFromShopify(shop.id)` — only fire-and-forget in afterLoginService with no .catch(); siblings at 25, 30, 37 all have one
- `packages/functions/src/services/shop.service.js:131` — `throw e` after logging turns the caller's bare `void` into an unhandled rejection
- `packages/functions/src/services/shop.service.js:83` — bare `initShopify(shopFromDB).graphql(...)` with no retry wrapper — got client, source of the `HTTPError: Response code 500` stack at got/as-promise/index.js:118
- `packages/functions/src/services/after-login.service.js:116` — setupTemplates' outer catch logs `[setupTemplates] e.message` and swallows — the alerted line never propagates
- `packages/functions/src/services/after-login.service.js:37` — caller already guards setupTemplates with .catch(), so even a rethrow there could not have produced the 500
- `packages/functions/src/services/shopifyService.js:705` — getMainThemeId rethrows into setupTemplates after logging the paired [getMainThemeId] line
- `packages/functions/src/services/shopifyService.js:160` — shopifyRetryError codes [429,430,502,503] exclude 500, so the REST theme.list path never retried the brownout
- `packages/functions/src/middleware/errorHandler.js:17` — logs [unhandledError] for every >=500 Koa catches — its absence for the 3 /api/shops 500s proves they bypassed the route

## Evidence
- 3 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-06T08:20:27Z" AND timestamp<="2026-09-06T08:50:27Z" AND jsonPayload.tag="[setupTemplates]"`
- 4 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-06T08:20:27Z" AND timestamp<="2026-09-06T08:50:27Z" AND jsonPayload.tag="[getMainThemeId]"`
- 4 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-06T08:20:27Z" AND timestamp<="2026-09-06T08:50:27Z" AND jsonPayload.tag="[syncShopDataFromShopify]"`
- 3 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-06T08:20:27Z" AND timestamp<="2026-09-06T08:50:27Z" AND httpRequest.status=500 AND httpRequest.requestUrl:"/api/shops"`
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-06T08:20:27Z" AND timestamp<="2026-09-06T08:50:27Z" AND textPayload:"Exception from a finished function"`
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-06T08:20:27Z" AND timestamp<="2026-09-06T08:50:27Z" AND jsonPayload.tag="[unhandledError]"`
- 25 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-06T08:20:27Z" AND timestamp<="2026-09-06T08:50:27Z" AND jsonPayload.tag="[shopifyRetryGraphQL]"`

## Job
- analyze rounds: 1
- cost: $1.83

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
