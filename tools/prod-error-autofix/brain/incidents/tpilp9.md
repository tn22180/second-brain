fingerprint: tpilp9
service: apisa
message: [fetchAllImagesFromShopify] uQjKioPw1h8iZk2i0PUV Error fetching images RequestError: Throttled
app: BLOG
repo: blogs
date: 2026-08-22T07:39:31.048Z
status: fix_disabled
attempt: 1

# BLOG · apisa · tpilp9

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** GET /apiSa/get-list-ai-image sweeps up to 20 pages of Shopify `files(first: 250)` through a shopify-api-node client whose autoLimit does not throttle graphql(), so on big-library shop uQjKioPw1h8iZk2i0PUV the sweep drained Shopify's GraphQL cost bucket and returned `RequestError: Throttled`, which the catch swallows at logger.error and `break`s — the request still answered HTTP 200 with a silently truncated image list.

**Mechanism.** genImageAIController.get → getListImageAiGraphql (imageGeneration.service.js:174) calls fetchAllImagesFromShopify unconditionally, ignoring the request's own limit=10&page=1. That loop (imageGeneration.service.js:124) issues up to MAX_FETCH_PAGES=20 sequential `files(first: 250, sortKey: CREATED_AT, reverse: true)` queries (line 88) with nested metafield + preview.image + originalSource selections — a high per-page GraphQL cost — over a plain `shopify.graphql()` (line 126). initShopify (shopifyService.js:30) sets `autoLimit: true`, but that is shopify-api-node's REST leaky-bucket limiter; graphql() bypasses it, so nothing paces or retries the sweep. Shopify answered one page with `Throttled` (ERR_GOT_REQUEST_ERROR) at 2026-08-21T11:05:56.082005Z. That is request start 11:05:46.924699Z + its logged latency 9.156199930s = 11:05:56.0809Z, i.e. the same request, to within 1.1 ms. The catch at line 134 logs at logger.error and `break`s, so the partial `allImages` is processed and paginated as if complete: that request answered **HTTP 200** (requests read with httpRequest.status>=500 is empty — this is why round 1's 5xx query matched nothing). Net effect is two defects on one line: a retryable transient escalated to severity=ERROR (which is what fired the alert), and a truncated result served to the merchant as success. The other two ERRORs in the window are `getShopifyArticleById ... Article not found` from articleController.list/getOne — the recorded P2 family, a different cause, not this alert's.

Confidence: `high`

## Code
- `packages/functions/src/services/imageGeneration.service.js:174` — getListImageAiGraphql calls fetchAllImagesFromShopify on every request, before page/limit are considered — the full sweep is unavoidable
- `packages/functions/src/services/imageGeneration.service.js:124` — while (hasNextPage && pagesFetched < MAX_FETCH_PAGES) — up to 20 sequential 250-file pages, no cost-aware pacing
- `packages/functions/src/services/imageGeneration.service.js:88` — files(first: 250) with nested metafield + preview.image + originalSource; the per-page GraphQL cost that drains the bucket
- `packages/functions/src/services/imageGeneration.service.js:126` — bare shopify.graphql() — no shopifyRetryGraphQL wrapper, so a Throttled page is never retried
- `packages/functions/src/services/imageGeneration.service.js:134` — the exact log line in the alert: catch logs at logger.error (severity ERROR) and breaks, turning a retryable throttle into an alert plus a silently truncated list
- `packages/functions/src/services/shopifyService.js:30` — initShopify sets autoLimit: true, which is shopify-api-node's REST limiter only — graphql() calls are unpaced
- `packages/functions/src/routes/api.js:259` — route registration tying GET /get-list-ai-image to genImageAIController.get

## Evidence
- 1 matching entries: `(resource.labels.service_name="apisa" OR resource.labels.function_name="apisa") AND timestamp>="2026-08-21T10:50:57.514Z" AND timestamp<="2026-08-21T11:20:57.514Z" AND "fetchAllImagesFromShopify"`
- 4 matching entries: `resource.labels.service_name="apisa" AND timestamp>="2026-08-21T10:50:00Z" AND timestamp<="2026-08-21T11:20:00Z" AND httpRequest.requestUrl:"get-list-ai-image"`
- 1 matching entries: `(resource.labels.service_name="apisa" OR resource.labels.function_name="apisa") AND timestamp>="2026-08-20T11:20:57Z" AND timestamp<="2026-08-21T11:20:57Z" AND "fetchAllImagesFromShopify"`
- 2 matching entries: `(resource.labels.service_name="apisa" OR resource.labels.function_name="apisa") AND timestamp>="2026-08-21T10:50:57.514Z" AND timestamp<="2026-08-21T11:20:57.514Z" AND "Article not found"`

## Job
- analyze rounds: 2
- cost: $2.39

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
