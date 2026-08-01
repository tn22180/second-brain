fingerprint: nkovr
service: api
message: [fetchAllImagesFromShopify] fKUMrHXwtJca3KNWMU6X Error fetching images HTTPError: Response code 503 (Service Unavailable)
app: BLOG
repo: blogs
date: 2026-07-31T14:39:11.730Z
status: deferred
attempt: 1

# BLOG · api · nkovr

**Outcome.** MR deferred by mr_per_repo_per_day

**Root cause.** Shopify's Admin GraphQL answered HTTP 503 to one `files(first:250)` page request for shop fKUMrHXwtJca3KNWMU6X at 13:13:52Z; `fetchAllImagesFromShopify` has no retry around `shopify.graphql`, so its catch logged the error, `break`ed the pagination loop, and returned the images collected so far — the caller then served HTTP 200 with a silently truncated (here empty) AI-image list.

**Mechanism.** `getListImageAiGraphql` → `fetchAllImagesFromShopify` builds a Shopify client via `initShopify` (shopify-api-node 3.15.0, got under the hood, `autoLimit: true` only — no retry config). got's default retry policy covers 503 but only for idempotent methods; Admin GraphQL is POST, so the 503 is thrown straight through as `HTTPError: Response code 503 (Service Unavailable)` from `as-promise/index.js:118`. The `try` at packages/functions/src/services/imageGeneration.service.js:118 catches it, logs `[fetchAllImagesFromShopify] fKUMrHXwtJca3KNWMU6X Error fetching images`, and `break`s the `while` at line 128, so `allImages` is returned partial. `genImageAIController.get` never sees an exception and sets `ctx.status = 200`. That matches the request log: the only 5xx in the 30-min window is the 13:20:59Z /api/gen-ai-suggested/recommendBlogPost entry — there is no 5xx for /api/get-list-ai-image at 13:13:52Z. The 503 itself is upstream and transient, not shop-specific: a second, independent Shopify 503 hit the axios path (`shopifyRetryGraphQL` → `makeGraphQlApi` → `getShopLocales`) at 13:01:52Z in the same window, 12 minutes earlier, from a different HTTP client.

Confidence: `medium`

## Code
- `packages/functions/src/services/imageGeneration.service.js:119` — `await shopify.graphql(buildQuery(endCursor))` — the POST that received Shopify's 503; no retry wrapper
- `packages/functions/src/services/imageGeneration.service.js:127` — the exact log line in the alert: logger.error('[fetchAllImagesFromShopify]', shop?.id, 'Error fetching images', error)
- `packages/functions/src/services/imageGeneration.service.js:128` — `break` — a single transient 503 ends pagination and the partial list is returned as if complete
- `packages/functions/src/services/imageGeneration.service.js:132` — `return allImages` — no signal to the caller that the sweep aborted early
- `packages/functions/src/controllers/genImageAIController.js:88` — ctx.status = 200 on the truncated result, which is why the alert has no matching 5xx request log
- `packages/functions/src/services/shopifyService.js:26` — initShopify constructs shopify-api-node with autoLimit only — no got retry/timeout options, so 5xx on POST is fatal on first attempt

## Evidence
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-31T12:58:54.904Z" AND timestamp<="2026-07-31T13:28:54.904Z" AND jsonPayload.message:"fetchAllImagesFromShopify"`
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-31T12:58:54.904Z" AND timestamp<="2026-07-31T13:28:54.904Z" AND jsonPayload.message:"status code 503"`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-31T12:58:54.904Z" AND timestamp<="2026-07-31T13:28:54.904Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $0.85

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
