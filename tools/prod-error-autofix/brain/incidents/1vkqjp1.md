fingerprint: 1vkqjp1
service: api
message: [getProductsGraphQL] Error fetching products: RequestError: read ECONNRESET
app: BLOG
repo: blogs
date: 2026-10-15T02:08:46.737Z
status: fix_disabled
attempt: 1

# BLOG · api · 1vkqjp1

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** The Shopify Admin client from initShopify is built with autoLimit:true and no maxRetries, which forces got's retry=0 inside shopify-api-node, so a single transient TLS `read ECONNRESET` on the products query aborted GET /api/shopify/products outright — getProductsGraphQL wraps shopify.graphql() in no retry at all, and the app's own shopifyRetryApi/shopifyRetryError classifier would not have retried it either because it only matches 429/430/502/503.

**Mechanism.** GET /api/shopify/products started 2026-10-15T02:00:19.331400Z on revision api-00190-lub, latency 3.040558338s → ended 02:00:22.3720Z, status **200**; the alerted ERROR line is stamped 02:00:22.374215Z (execution_id 8w605453qu4j), 2ms later — same request. Path: routes/api.js:198 → shopifyController.getProductsStore (:255) → initShopify (shopifyService.js:24) → getProductsGraphQL (graphQLProducts.js:12) → `await shopify.graphql(query)` (:61). initShopify passes autoLimit:true and omits maxRetries (shopifyService.js:31), so shopify-api-node leaves maxRetries at its default 0 (index.js:66) and sets `options.retry = 0` on the graphql call (index.js:337); the library's own retryableErrorCodes DOES contain 'ECONNRESET' (index.js:14) but is only wired up when maxRetries > 0, and the constructor throws on `autoLimit && maxRetries` (index.js:56), so retry cannot be turned on in the client — it has to live at the call site. The catch at :63 logs at logger.error (:67 — the alerted line) and rethrows (:69); getProductsStore's catch (:268) swallows it into `ctx.body = {success:false, message: e}` (:269), which is why the request logged 200 and the `httpRequest.status>=500` read returned 0 entries. The merchant's product picker came back empty with success:false.

This was not an isolated socket. /api/blockLoader started 02:00:19.324393Z, latency 3.151578182s → ended 02:00:22.4760Z, also status 200, and its ECONNRESET logged at 02:00:22.478513Z (execution_id 8w602xigrwh1, `[getMainThemeId]`) — 3ms later. Two different Shopify Admin sockets, two different executions, same shop MSei5vNXF3VnxCgRox4a, both reset ~3.05s in, 104ms apart: a transient reset on the path to Shopify, not a per-call fault. That second path went through shopifyRetryApi (shopifyService.js:691 → :142) and still failed, because shopifyRetryError (:161) classifies only by `message` containing 429/430/502/503 or a `retry-after` header (:167) — 'RequestError: read ECONNRESET' matches none, retry=0, and :147 rethrows as `new Error(e)`, which also strips error.code so any later code-based classifier would be defeated too. blockLoader degraded to `ctx.body = {data: [], error}` at appBlockController.js:105, again a 200.

Scale: 17 ECONNRESET lines in the 30-min alert window, 132 in the preceding 24h across 18 distinct instances — chronic, not one bad container. Of those 132, only 20 carry an application tag (8 shopifyRetryGraphQL, 3 blockLoader, 2 getEnableBlocks, 2 fetchAllImagesFromShopify, 1 each getMainThemeId / getProductsGraphQL / getOptions / getPostsGraphQL); the other 112 are the bare runtime line `Exception from a finished function: Error: read ECONNRESET`, i.e. unhandled rejections escaping after the response finished, with no tag identifying the call site. `[getProductsGraphQL]` fired exactly once in 24h, so the alert fingerprint is one sampled symptom of a fleet-wide missing-transport-retry defect, not a bug specific to the product query.

Confidence: `high`

## Code
- `packages/functions/src/helpers/graphql/graphQLProducts.js:61` — await shopify.graphql(query) — the unretried Admin POST whose TLS socket got `read ECONNRESET`
- `packages/functions/src/helpers/graphql/graphQLProducts.js:67` — the exact alerted line: logger.error('[getProductsGraphQL]', 'Error fetching products:', error)
- `packages/functions/src/helpers/graphql/graphQLProducts.js:69` — rethrow — no retry wrapper anywhere between here and the controller
- `packages/functions/src/services/shopifyService.js:31` — initShopify passes autoLimit:true and no maxRetries → shopify-api-node sets got retry=0
- `packages/functions/src/services/shopifyService.js:167` — shopifyRetryError classifies only 429/430/502/503 by message substring; 'read ECONNRESET' is not retryable under it
- `packages/functions/src/services/shopifyService.js:147` — shopifyRetryApi rethrows as `new Error(e)`, discarding error.code — defeats any code-based retry classifier downstream
- `packages/functions/src/services/shopifyService.js:691` — getMainThemeId does go through shopifyRetryApi and still failed on the same reset — proves the gap is the classifier, not just the missing wrapper
- `packages/functions/src/controllers/shopifyController.js:269` — ctx.body = {success:false, message: e} — the 500 is converted to a 200, which is why the requests read returned 0
- `packages/functions/src/controllers/shopifyController.js:261` — getProductsStore's call into getProductsGraphQL — the entry point of the alerted execution
- `packages/functions/src/routes/api.js:198` — GET /shopify/products → shopifyController.getProductsStore, the route behind the alerted execution
- `packages/functions/src/controllers/appBlockController.js:105` — blockLoader also answers 200 with a degraded body on the concurrent reset at 02:00:22.478Z
- `node_modules/shopify-api-node/index.js:337` — options.retry = 0 on the graphql path when maxRetries is not > 0 — why got did not retry this ECONNRESET
- `node_modules/shopify-api-node/index.js:56` — constructor throws on autoLimit && maxRetries, so retry cannot be enabled on initShopify's client — it must be done at the call site
- `node_modules/shopify-api-node/index.js:14` — ECONNRESET is in the library's own retryableErrorCodes — the library considers this class safe to retry

## Evidence
- 17 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-10-15T01:45:29.582Z" AND timestamp<="2026-10-15T02:15:29.582Z" AND "ECONNRESET"`
- 132 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-10-14T02:15:00Z" AND timestamp<="2026-10-15T02:15:29Z" AND "ECONNRESET"`
- 41 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-10-15T01:59:00Z" AND timestamp<="2026-10-15T02:01:30Z" AND httpRequest.requestMethod!=""`
- 1 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-10-15T01:45:29.582Z" AND timestamp<="2026-10-15T02:15:29.582Z" AND "[getProductsGraphQL]"`

## Job
- analyze rounds: 1
- cost: $1.73

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
