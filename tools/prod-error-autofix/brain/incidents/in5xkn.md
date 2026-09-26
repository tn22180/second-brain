fingerprint: in5xkn
service: api
message: [fetchAllImagesFromShopify] KQPDpkL7H8TeEkbeloj6 Error fetching images RequestError: Timeout awaiting 'request' for 60000ms
app: BLOG
repo: blogs
date: 2026-09-25T18:44:20.060Z
status: fix_disabled
attempt: 1

# BLOG · api · in5xkn

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** One Shopify Admin GraphQL POST for a files(first:250) page in fetchAllImagesFromShopify hung past shopify-api-node's default 60000ms got timeout, and because that call is issued through a bare initShopify client with no retry and no override, the catch logged it at logger.error (severity=ERROR, which fires the alert) and broke the pagination loop — the request itself still answered 200 with a partial image list, so no 500 exists in the window.

**Mechanism.** genImageAIController.get → getListImageAiGraphql(shop, …) → fetchAllImagesFromShopify(shop) builds its client with initShopify(shop), which constructs `new Shopify({apiVersion, accessToken, shopName, autoLimit: true})` and passes no `timeout`, so shopify-api-node's own default `timeout: 60000` (node_modules/shopify-api-node/index.js:65, handed to got at index.js:286) applies. Inside the `while (hasNextPage && pagesFetched < MAX_FETCH_PAGES)` loop the single `await shopify.graphql(buildQuery(endCursor))` at imageGeneration.service.js:141 is the only outbound call that can throw got's `RequestError: Timeout awaiting 'request' for 60000ms` — matching the alerted stack exactly (got/dist/source/core/utils/timed-out.js → TLSSocket.socketErrorListener, jsonPayload.error.code ETIMEDOUT, name TimeoutError). The catch at imageGeneration.service.js:148-150 logs `'[fetchAllImagesFromShopify]', shop?.id` — the alert carries shop id KQPDpkL7H8TeEkbeloj6 — then `break`s, so the function returns whatever pages it already had. getListImageAiGraphql then filters that partial array and genImageAIController.get sets ctx.status = 200 (genImageAIController.js:92). That is why the requests read (httpRequest.status>=500) came back with 0 entries for the whole 30-minute window while the errors read has exactly this 1 line: the failure is swallowed into a short/empty image list for the merchant, and the only thing that escalates is the severity=ERROR log.

Confidence: `medium`

## Code
- `packages/functions/src/services/imageGeneration.service.js:141` — The only outbound call in the function — `await shopify.graphql(buildQuery(endCursor))` — issued through a bare client with no retry wrapper and no per-request deadline; this is what got timed out at 60000ms.
- `packages/functions/src/services/imageGeneration.service.js:149` — `logger.error('[fetchAllImagesFromShopify]', shop?.id, 'Error fetching images', error)` produces the alerted line verbatim, including the shop id KQPDpkL7H8TeEkbeloj6 and the tag '[fetchAllImagesFromShopify]' in jsonPayload.tag.
- `packages/functions/src/services/imageGeneration.service.js:150` — `break` after logging: the sweep abandons remaining pages and returns the partial allImages array, so the timeout never surfaces to the caller as a failure.
- `packages/functions/src/services/shopifyService.js:27` — initShopify constructs `new Shopify({apiVersion, accessToken, shopName, autoLimit: true})` with no `timeout` option, so shopify-api-node's 60000ms default is the deadline that fired — and autoLimit only paces REST leaky-bucket, not GraphQL cost or slow responses.
- `packages/functions/src/controllers/genImageAIController.js:92` — `ctx.status = 200` on the success path — the partial list from the aborted sweep is returned as success, which is why requests (status>=500) matched 0 entries in the alert window.

## Evidence
- 1 matching entries: `resource.labels.service_name="api" AND jsonPayload.tag="[fetchAllImagesFromShopify]" AND timestamp>="2026-09-25T18:26:43.091Z" AND timestamp<="2026-09-25T18:56:43.091Z"`
- 11 matching entries: `resource.labels.service_name="api" AND jsonPayload.tag="[fetchAllImagesFromShopify]" AND timestamp>="2026-09-18T00:00:00Z" AND timestamp<="2026-09-26T00:00:00Z"`
- 11 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api" OR resource.labels.job_name="api") AND timestamp>="2026-09-25T18:26:43.091Z" AND timestamp<="2026-09-25T18:56:43.091Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $1.86

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
