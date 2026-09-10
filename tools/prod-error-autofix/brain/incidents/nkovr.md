fingerprint: nkovr
service: api
message: [fetchAllImagesFromShopify] S6tXkqv1jHwO5skA6gtK Error fetching images HTTPError: Response code 503 (Service Unavailable)
app: BLOG
repo: blogs
date: 2026-09-09T19:49:48.863Z
status: fix_disabled
attempt: 1

# BLOG · api · nkovr

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** A single transient Shopify Admin GraphQL HTTP 503 on one `files(first:250)` page for shop S6tXkqv1jHwO5skA6gtK aborted fetchAllImagesFromShopify's pagination loop; the catch logs and `break`s, so GET /api/get-list-ai-image answered 200 with a silently truncated AI-image list instead of failing.

**Mechanism.** genImageAIController.get → getListImageAiGraphql → fetchAllImagesFromShopify builds its client via initShopify (shopify-api-node, `autoLimit: true` only, no got retry/timeout config — shopifyService.js:26). Admin GraphQL is POST, which got's default retry policy excludes, so Shopify's 503 is thrown straight out of as-promise/index.js:118 as `HTTPError: Response code 503 (Service Unavailable)` — exactly the frame in the alert. The `try` around `await shopify.graphql(buildQuery(endCursor))` (imageGeneration.service.js:141) catches it, emits the alerted line at :149, and `break`s the `while` at :150, so `allImages` is returned partial at :154. getListImageAiGraphql then filters/paginates whatever was collected and the controller sets `ctx.status = 200` (genImageAIController.js:92). The request logs confirm the swallow: 7 GET /api/get-list-ai-image entries in the 30-min window, all HTTP 200, zero entries with status>=500 (requests read empty). The request at 19:46:37.279Z ran 20.20s against an 8.0s median for the other six, the only latency outlier and the one adjacent to the 19:46:57.485Z error. The 503 is transient and not shop-specific: exactly 1 fetchAllImagesFromShopify error in the full 24h preceding the alert. This is a recurrence of fingerprint nkovr (2026-07-31, shop fKUMrHXwtJca3KNWMU6X) — same file, same line, MR was deferred, defect still unfixed on master.

Confidence: `high`

## Code
- `packages/functions/src/services/imageGeneration.service.js:141` — await shopify.graphql(buildQuery(endCursor)) — the POST that received Shopify's 503; no retry wrapper
- `packages/functions/src/services/imageGeneration.service.js:149` — the exact alerted log line: logger.error('[fetchAllImagesFromShopify]', shop?.id, 'Error fetching images', error)
- `packages/functions/src/services/imageGeneration.service.js:150` — break — one transient 503 ends pagination for good
- `packages/functions/src/services/imageGeneration.service.js:154` — return allImages — partial sweep returned with no signal to the caller
- `packages/functions/src/services/imageGeneration.service.js:189` — getListImageAiGraphql awaits fetchAllImagesFromShopify and treats its result as complete
- `packages/functions/src/controllers/genImageAIController.js:92` — ctx.status = 200 on the truncated result — why the alert has no matching 5xx request log
- `packages/functions/src/services/shopifyService.js:26` — initShopify constructs shopify-api-node with autoLimit only — no got retry/timeout, so a 5xx on POST is fatal on first attempt

## Evidence
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-09T19:32:11.176Z" AND timestamp<="2026-09-09T20:02:11.176Z" AND jsonPayload.message:"fetchAllImagesFromShopify"`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-08T20:02:11Z" AND timestamp<="2026-09-09T20:02:11Z" AND jsonPayload.message:"fetchAllImagesFromShopify"`
- 7 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-09T19:32:11Z" AND timestamp<="2026-09-09T20:02:11Z" AND httpRequest.requestUrl:"get-list-ai-image"`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api" OR resource.labels.job_name="api") AND timestamp>="2026-09-09T19:32:11.176Z" AND timestamp<="2026-09-09T20:02:11.176Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.43

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
