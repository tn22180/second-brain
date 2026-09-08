fingerprint: gnx4is
service: api
message: [handleError] PnKC4q13qtMCeY1BDfEz undefined HTTPError: Response code 500 (Internal Server Error)
app: BLOG
repo: blogs
date: 2026-09-08T02:05:15.774Z
status: fix_disabled
attempt: 1

# BLOG · api · gnx4is

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** articleController.getOne awaits shopLocalesGraphQL(shopify) at articleController.js:224 — outside the try that opens at :226 and outside shopifyRetryGraphQL — so during the 2026-09-06T08:35–08:39Z Shopify Admin API brownout the raw shopify.graphql() 500 escaped the controller and was logged by Koa's errorHandler ([unhandledError]) and then re-logged by errorService.handleError, which is the alerted line.

**Mechanism.** getOne validates the id, loads the shop and builds a shopify-api-node client (articleController.js:220-222), then awaits shopLocalesGraphQL(shopify) at :224, two lines above the try at :226. shopLocalesGraphQL issues a bare shopify.graphql(...) (shopLocalesGraphQL.js:8); initShopify constructs the client with only autoLimit:true (shopifyService.js:26), which throttles rate limits and never retries 5xx, and got does not retry POST — so Shopify's HTTP 500 surfaces as `HTTPError: Response code 500 (Internal Server Error)` with code ERR_NON_2XX_3XX_RESPONSE at /workspace/node_modules/got/dist/source/as-promise/index.js:118, exactly the alerted stack. Because the throw happens before :226, the controller's own catch at :333 never ran: the window's only two `[getOne]` lines are `Error get settings` from settingsController.js:75, not `error getOne` from articleController.js:333. The retry wrapper never ran either — all 25 `[shopifyRetryGraphQL]` lines in the window carry AxiosError (helpers/api.js path), while the failing call produced a got HTTPError, proving it bypassed makeGraphQlApi even though RETRYABLE_STATUSES at helpers/api.js:145 already contains 500. errorHandler.js:17 then logged `[unhandledError] GET /api/article/630397731103 500` at 08:35:26.584113Z and its `ctx.app.emit('error', err, ctx)` at errorHandler.js:31 fired errorService.handleError, which logged the alerted `[handleError] PnKC4q13qtMCeY1BDfEz undefined HTTPError: Response code 500` 9.2 ms later at 08:35:26.593328Z (errorService.js:12; the `undefined` is user.shop?.shopifyDomain). These are the only two ERR_NON_2XX_3XX_RESPONSE entries in the window that are not [syncShopDataFromShopify] or [fetchAllImagesFromShopify] — 9 total, and each of the other 7 is caught by its own call site. Same defect family as recorded fingerprints r2v3gh (MR 878, open/unmerged) and xeycw (MR 886) — the code at articleController.js:224 is unchanged on this worktree, so the fix has not shipped. The upstream trigger is a Shopify Admin brownout on this instance (00a41e8c1d6dd670): 25 shopifyRetryGraphQL 500/503 failures between 08:35:13.470Z and 08:39:08.935Z. Distinct from the same-window a2foaq/4nac83 finding: those 3 /api/shops 500s came from an unhandled rejection in afterLoginService; this one went through the Koa route stack and Cloud Run logged it as 200 (errorHandler only sets ctx.status when ctx.get('accept') === 'application/json' exactly, errorHandler.js:22 — axios sends `application/json, text/plain, */*`, so the branch fell to ctx.render and the merchant got a 200 carrying an error page, which is why the requests read has no entry for /api/article/630397731103).

Confidence: `high`

## Code
- `packages/functions/src/controllers/articleController.js:224` — shopLocalesGraphQL awaited outside the try block — the only unguarded Shopify HTTP call on this request path
- `packages/functions/src/controllers/articleController.js:226` — try block opens here; everything below degrades to 200 {success:false} via the catch at :333
- `packages/functions/src/controllers/articleController.js:333` — catch that never ran — no `[getOne] ... error getOne` line exists in the window
- `packages/functions/src/helpers/graphql/shopLocalesGraphQL.js:8` — raw shopify.graphql() — bypasses makeGraphQlApi/shopifyRetryGraphQL, so no retry and no [shopifyRetryGraphQL] line for this call
- `packages/functions/src/services/shopifyService.js:26` — shopify-api-node built with autoLimit:true only — rate-limit throttling, no 5xx retry; got is its HTTP layer, matching the /workspace/node_modules/got frame
- `packages/functions/src/helpers/api.js:145` — RETRYABLE_STATUSES already contains 500 — the retry path that would have absorbed this exists and is simply not on this call path
- `packages/functions/src/middleware/errorHandler.js:17` — emits `[unhandledError] GET /api/article/630397731103 500` at 08:35:26.584113Z
- `packages/functions/src/middleware/errorHandler.js:31` — ctx.app.emit('error', err, ctx) — the 9.2 ms link from [unhandledError] to the alerted [handleError]
- `packages/functions/src/services/errorService.js:12` — emits the exact alerted text `[handleError] <shopID> <shopifyDomain=undefined> <err>`
- `packages/functions/src/handlers/api.js:102` — api.on('error', errorService.handleError) — wires the emit to the alerted logger
- `packages/functions/src/controllers/settingsController.js:75` — source of the two `[getOne] ... Error get settings` lines — proves the window's [getOne] entries are not articleController's catch

## Evidence
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-06T08:20:28Z" AND timestamp<="2026-09-06T08:50:28Z" AND jsonPayload.tag="[handleError]"`
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-06T08:20:28Z" AND timestamp<="2026-09-06T08:50:28Z" AND jsonPayload.tag="[unhandledError]"`
- 2 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-06T08:20:28Z" AND timestamp<="2026-09-06T08:50:28Z" AND jsonPayload.tag="[getOne]"`
- 9 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-06T08:20:28Z" AND timestamp<="2026-09-06T08:50:28Z" AND jsonPayload.error.code="ERR_NON_2XX_3XX_RESPONSE"`
- 25 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-06T08:20:28Z" AND timestamp<="2026-09-06T08:50:28Z" AND jsonPayload.tag="[shopifyRetryGraphQL]"`
- 4 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-06T08:33:00Z" AND timestamp<="2026-09-06T08:40:00Z" AND httpRequest.requestUrl:"/api/article/630397731103"`

## Job
- analyze rounds: 1
- cost: $2.27

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
