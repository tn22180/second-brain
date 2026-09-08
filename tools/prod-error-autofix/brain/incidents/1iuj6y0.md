fingerprint: 1iuj6y0
service: api
message: [getShopifyRecentBlogs] PnKC4q13qtMCeY1BDfEz Error when get blog list {"message":"Response code 500 (Internal Server Error)","stack":"HTTPError: Response code 500 (Internal Server Error)\n    at Request.<anonymous> (/workspace/node_modules/got/dist/source/as-promise/index.js:118:42)\n    at process.
app: BLOG
repo: blogs
date: 2026-09-08T02:08:45.431Z
status: fix_disabled
attempt: 1

# BLOG · api · 1iuj6y0

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Duplicate of the recorded 2026-09-06 08:35–08:46Z BLOG api Shopify Admin brownout family (fingerprints 4nac83 / 13fxio6 / a2foaq — same instance 00a41e8c1d6dd670…, same revision api-00166-zis): Shopify Admin returned HTTP 500/503 to this instance for ~4 minutes, and getShopifyRecentBlogs issues its `articles` query through a bare `initShopifyStable(shop).graphql(...)` with no retry wrapper, so the first upstream 500 became the alerted line; the error is swallowed and no request failed because of it.

**Mechanism.** GET /api/recentBlogs (routes/api.js:105) → articleController.getRecentBlogsWithLimit → getShopifyRecentBlogs (shopifyService.js:634). The client is built by initShopifyStable (shopifyService.js:636), which is a plain shopify-api-node `new Shopify({autoLimit:true})` (shopifyService.js:34-44) with no shopifyRetryGraphQL / makeGraphQlApi wrapper, so `await shopify.graphql(getRecentBlogsQuery)` at shopifyService.js:659 gets one shot. During the brownout got rejected with `HTTPError: Response code 500 (Internal Server Error)` at got/dist/source/as-promise/index.js:118 (`code: ERR_NON_2XX_3XX_RESPONSE`), the catch at shopifyService.js:671 logged the alerted line at 08:35:26.172989Z (jsonPayload.tag="[getShopifyRecentBlogs]", shop PnKC4q13qtMCeY1BDfEz), and shopifyService.js:677 returned `{data: []}`. That single occurrence sits inside a burst of 25 `[shopifyRetryGraphQL]` failures (21× 500, 4× 503) spanning 08:35:13.470813Z → 08:39:08.935817Z with a tail at 08:46:24–25Z, all on one instance/revision — the GraphQL path retried because helpers/api.js:145 RETRYABLE_STATUSES contains 500, this call path has no wrapper to retry with. The window's only 500 responses are 3× GET /api/shops (0.68s / 0.93s / 0.46s), already attributed to the un-`.catch()`-ed `void syncShopDataFromShopify` in fingerprint 4nac83; there is no 5xx request log for /recentBlogs, so the merchant got HTTP 200 with an empty recent-blogs list, not an error.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyService.js:659` — bare `await shopify.graphql(getRecentBlogsQuery)` — single attempt, no retry wrapper; source of the got HTTPError
- `packages/functions/src/services/shopifyService.js:636` — initShopifyStable(shop) — plain shopify-api-node client, no shopifyRetryGraphQL/makeGraphQlApi
- `packages/functions/src/services/shopifyService.js:672` — logger.error('[getShopifyRecentBlogs]', shop?.id, 'Error when get blog list', {message, stack, response}) — emits the exact alerted line
- `packages/functions/src/services/shopifyService.js:677` — `return {data: []}` — error swallowed, so this ERROR is not a request failure
- `packages/functions/src/services/shopifyService.js:34` — initShopifyStable builds `new Shopify({autoLimit:true})` — autoLimit is rate-limit pacing only, no 5xx retry
- `packages/functions/src/controllers/articleController.js:1084` — getRecentBlogsWithLimit calls getShopifyRecentBlogs inside Promise.all; consumes articleList.data unconditionally at line 1091, so the empty array degrades silently
- `packages/functions/src/routes/api.js:105` — the route that reaches this code: GET /recentBlogs
- `packages/functions/src/helpers/api.js:145` — RETRYABLE_STATUSES = [429,500,502,503,504,520] — the wrapper that would have ridden out this brownout, unused on this path

## Evidence
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-06T08:20:28Z" AND timestamp<="2026-09-06T08:50:28Z" AND jsonPayload.tag="[getShopifyRecentBlogs]"`
- 25 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-06T08:20:28Z" AND timestamp<="2026-09-06T08:50:28Z" AND jsonPayload.tag="[shopifyRetryGraphQL]"`
- 3 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-06T08:20:28Z" AND timestamp<="2026-09-06T08:50:28Z" AND httpRequest.status>=500`
- 4 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-06T08:20:28Z" AND timestamp<="2026-09-06T08:50:28Z" AND jsonPayload.tag="[syncShopDataFromShopify]"`
- 44 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-06T08:20:28Z" AND timestamp<="2026-09-06T08:50:28Z" AND severity>=ERROR AND labels.instanceId="00a41e8c1d6dd6707c553fa820928b9ab8f1b02a3840c71b1f524775ab1dfdd5139ae545436b6154a60e1f7d0548ade008c523d329a25bef629cfa8a108a52f1be39737730757db65805f1c50260"`

## Job
- analyze rounds: 1
- cost: $1.84

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
