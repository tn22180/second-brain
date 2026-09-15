fingerprint: tqoh3h
service: api
message: [fetchAllImagesFromShopify] xRkCfmBEFY061OU6ygop Error fetching images RequestError: read ECONNRESET
app: BLOG
repo: blogs
date: 2026-09-14T17:33:49.747Z
status: fix_disabled
attempt: 1

# BLOG · api · tqoh3h

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** The Shopify Admin GraphQL POST for one files(first:250) page in fetchAllImagesFromShopify hit a transport-level `read ECONNRESET` on api instance 00a41e8c1d4c at 17:26:48.319Z; the shopify-api-node client built by initShopify has maxRetries:0 (retry=0 in got), so the reset was not retried, and the catch at imageGeneration.service.js:148 logged it at severity ERROR and `break`ed, so GET /api/get-list-ai-image for shop xRkCfmBEFY061OU6ygop answered HTTP 200 with a silently truncated image list.

**Mechanism.** One request carries the whole chain. GET /api/get-list-ai-image?limit=10&model=black-forest-labs%2Fflux-schnell&page=1 started 17:26:33.753Z on instance 00a41e8c1d4c, latency 14.5655s → ends 17:26:48.318Z, status 200 — the alerted ERROR line is stamped 17:26:48.319Z on the same instance, i.e. the page loop ended on the reset and the request returned immediately. Zero httpRequest.status>=500 entries exist in the 30-min window (requests read = 0), which is consistent: the controller never saw an exception because fetchAllImagesFromShopify swallowed it. Route: routes/api.js:262 → genImageAIController.get → getListImageAiGraphql (imageGeneration.service.js:189) → fetchAllImagesFromShopify → shopify.graphql(buildQuery(endCursor)) (:141). initShopify (shopifyService.js:26-31) constructs shopify-api-node 3.15.0 with autoLimit:true and no maxRetries, so graphql() sets options.retry = 0 (node_modules/shopify-api-node/index.js:337); the library WOULD retry ECONNRESET (it is in retryableErrorCodes, index.js:14) only when maxRetries>0, and the constructor rejects autoLimit together with maxRetries (index.js:56), so retry cannot be enabled by a one-line client change — it has to be done at the call site. The catch (:148-151) logs at logger.error and breaks instead of rethrowing, so allImages is whatever pages completed and the controller sets ctx.status=200 (genImageAIController.js:92). The same instance logged `[redis.service] connection error ECONNRESET` 16s later (17:27:04.118Z) and reconnected at 17:27:06.260Z — two independent outbound sockets reset on one container inside 16s points at a transient network reset on that instance, not a Shopify-side fault, and the only fetchAllImagesFromShopify error in the preceding 24h is this one (count 1). Same defect family as recorded fingerprints 154s6rb / 1xy6kud / nkovr (HTTP 502/503 on the same unretried files page); this is the socket-level variant, which shopifyRetryError (shopifyService.js:160-166) would also not classify as retryable because it only matches 429/430/502/503 in the message string.

Confidence: `high`

## Code
- `packages/functions/src/services/imageGeneration.service.js:141` — await shopify.graphql(buildQuery(endCursor)) — the unretried POST whose TLS socket got `read ECONNRESET`
- `packages/functions/src/services/imageGeneration.service.js:149` — the exact alerted line: logger.error('[fetchAllImagesFromShopify]', shop?.id, 'Error fetching images', error)
- `packages/functions/src/services/imageGeneration.service.js:150` — `break` — swallows the transport error and returns a partial allImages instead of rethrowing
- `packages/functions/src/services/imageGeneration.service.js:93` — client comes from initShopify(shop) — inherits maxRetries:0
- `packages/functions/src/services/imageGeneration.service.js:189` — getListImageAiGraphql calls fetchAllImagesFromShopify — the path from GET /api/get-list-ai-image
- `packages/functions/src/services/shopifyService.js:30` — initShopify passes autoLimit:true and no maxRetries → shopify-api-node sets got retry=0
- `packages/functions/src/services/shopifyService.js:160` — shopifyRetryError only classifies 429/430/502/503 by message substring; 'read ECONNRESET' is not retryable under it either
- `packages/functions/src/controllers/genImageAIController.js:92` — ctx.status = 200 — truncated list is served as success; the 500 branch at :99 never ran, matching requests=0
- `packages/functions/src/routes/api.js:262` — GET /get-list-ai-image → genImageAIController.get
- `node_modules/shopify-api-node/index.js:337` — options.retry = 0 when maxRetries is not > 0 — why got did not retry the ECONNRESET on this POST
- `node_modules/shopify-api-node/index.js:56` — constructor throws on autoLimit && maxRetries, so retry cannot be enabled on initShopify's client — retry must live at the call site
- `node_modules/shopify-api-node/index.js:14` — ECONNRESET is in the library's retryableErrorCodes — it is a transient class the library itself considers safe to retry

## Evidence
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-14T17:12:10.689Z" AND timestamp<="2026-09-14T17:42:10.689Z" AND "[fetchAllImagesFromShopify]"`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-14T17:26:00Z" AND timestamp<="2026-09-14T17:27:30Z" AND httpRequest.requestUrl:"get-list-ai-image"`
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-14T17:12:10.689Z" AND timestamp<="2026-09-14T17:42:10.689Z" AND "ECONNRESET"`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-13T17:30:00Z" AND timestamp<="2026-09-14T17:42:10Z" AND "[fetchAllImagesFromShopify]"`

## Job
- analyze rounds: 2
- cost: $4.23

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
