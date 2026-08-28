fingerprint: 1xy6kud
service: apisa
message: [fetchAllImagesFromShopify] jHykiJCzGBThR3qPTq53 Error fetching images HTTPError: Response code 502 (Bad Gateway)
app: BLOG
repo: blogs
date: 2026-08-28T02:02:43.150Z
status: fix_disabled
attempt: 1

# BLOG · apisa · 1xy6kud

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Shopify Admin GraphQL answered one `files(first:250)` page POST with HTTP 502 for shop jHykiJCzGBThR3qPTq53 at 2026-08-26T04:02:21.136Z; fetchAllImagesFromShopify issues that POST through a raw shopify-api-node client with no retry, so its catch logged at logger.error, `break`ed the pagination loop and returned a partially-collected list while GET /apiSa/get-list-ai-image still answered HTTP 200.

**Mechanism.** genImageAIController.get (packages/functions/src/controllers/genImageAIController.js:83) → getListImageAiGraphql (imageGeneration.service.js:174) → fetchAllImagesFromShopify builds its client with initShopify (imageGeneration.service.js:78), which constructs shopify-api-node with `autoLimit: true` only — no got retry or timeout options (shopifyService.js:26-31). So the Admin GraphQL POST at imageGeneration.service.js:126 is unretried, and got throws `HTTPError: Response code 502 (Bad Gateway)` from as-promise/index.js:118 — exactly the frame in the alert. The catch at :133 emits the alerted line (:134) and `break`s the while loop (:135), so `allImages` is returned partial (:139); no exception reaches the controller, which sets ctx.status = 200 (genImageAIController.js:92). Timing proves the pairing: the Cloud Run request log for GET /apiSa/get-list-ai-image?model=black-forest-labs%2Fflux-schnell is stamped at request start 2026-08-26T04:02:12.457113Z with latency 8.679725782s → end 04:02:21.1368Z, 0.6 ms after the error line at 04:02:21.136220Z, and that request is logged 200. That 200 is why the `requests` read (httpRequest.status>=500) returned 0 entries for the whole 30-min window, and why the alert carries no failing endpoint. The repo owns a retry wrapper whose RETRYABLE_STATUSES already lists 502 (helpers/api.js:145), but only the makeGraphQlApi path reaches it, and its retryability test reads `e.response?.status` (api.js:165) — a field got never sets (got carries e.response.statusCode; api.js:149-152 documents that split and only isShopifyAuthError applies it), so wrapping this call as-is would still not retry. Frequency: 1 occurrence in 24h (2026-08-25T04:17Z→2026-08-26T04:17Z) across both `api` and `apisa` — transient upstream, same defect family as recorded fingerprints 154s6rb (502, 2026-08-12, service api) and nkovr (503, 2026-07-31). New here only in that the caller is the standalone /apiSa mount (handlers/apiSa.js mounts the same routes/api.js router), so the fix must live in the service, not the handler.

Confidence: `high`

## Code
- `packages/functions/src/services/imageGeneration.service.js:126` — `await shopify.graphql(buildQuery(endCursor))` — the unretried POST that received Shopify's 502
- `packages/functions/src/services/imageGeneration.service.js:134` — the exact log line in the alert: logger.error('[fetchAllImagesFromShopify]', shop?.id, 'Error fetching images', error)
- `packages/functions/src/services/imageGeneration.service.js:135` — `break` — one transient 502 ends pagination; the partial list is returned as if complete
- `packages/functions/src/services/imageGeneration.service.js:139` — `return allImages` — no signal to the caller that the sweep aborted early
- `packages/functions/src/services/imageGeneration.service.js:78` — `const shopify = initShopify(shop)` — raw shopify-api-node client, bypassing makeGraphQlApi/shopifyRetryGraphQL
- `packages/functions/src/services/shopifyService.js:30` — initShopify passes only `autoLimit: true` — no got retry/timeout options, so a 5xx on POST is fatal on the first attempt
- `packages/functions/src/controllers/genImageAIController.js:92` — ctx.status = 200 on the truncated result — why the alert has no matching 5xx request log
- `packages/functions/src/handlers/apiSa.js:54` — `const router = apiRouter('/apiSa')` — the standalone mount that makes the same route reachable as /apiSa/get-list-ai-image, the service in this alert
- `packages/functions/src/helpers/api.js:145` — RETRYABLE_STATUSES already lists 502 — the existing retry policy this call path never reaches
- `packages/functions/src/helpers/api.js:165` — retryability decided from `e.response?.status`, which got never sets (it uses e.response.statusCode), so reusing this wrapper unchanged would still not retry the 502

## Evidence
- 1 matching entries: `(resource.labels.service_name="apisa" OR resource.labels.service_name="api") AND timestamp>="2026-08-25T04:17:00Z" AND timestamp<="2026-08-26T04:17:34Z" AND jsonPayload.tag="[fetchAllImagesFromShopify]"`
- 1 matching entries: `(resource.labels.service_name="apisa") AND timestamp>="2026-08-26T03:55:00Z" AND timestamp<="2026-08-26T04:10:00Z" AND httpRequest.requestUrl:"get-list-ai-image"`
- 40 matching entries: `(resource.labels.service_name="apisa" OR resource.labels.service_name="api") AND timestamp>="2026-08-25T04:17:00Z" AND timestamp<="2026-08-26T04:17:34Z" AND httpRequest.requestUrl:"get-list-ai-image"`

## Job
- analyze rounds: 1
- cost: $1.40

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
