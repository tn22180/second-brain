fingerprint: gzw4fx
service: api
message: [handleError] Unauthenticated Error: Received an error response (400 Bad Request) from Shopify:
app: BLOG
repo: blogs
date: 2026-08-12T07:04:39.592Z
status: mr_open
attempt: 1

# BLOG · api · gzw4fx

**Outcome.** duplicate of w6i1j5 — MR https://gitlab.com/avada/blogs/-/merge_requests/856

**Root cause.** Duplicate of fingerprint w6i1j5 (MR https://gitlab.com/avada/blogs/-/merge_requests/856 open, unmerged): this alert is the `[handleError] Unauthenticated` sibling of the same single GET /api/options failure — a ~700 ms Shopify Admin auth brownout at 2026-08-05T08:20:52.8–53.5Z on api instance revision api-00118-tej for shop kozjvGcNBaGdLMGB7Pxq threw an @avada/shopify-api HttpResponseError (400, Shopify request id ab0a498e-a24b-42eb-89e7-b54b268b986e-1785918053) inside the pre-route @avada/core auth/charge middleware, and createErrorHandler's `err.status || 500` reported that upstream 4xx as a 500.

**Mechanism.** The two ERROR lines 28 ms apart (08:20:53.504 `[unhandledError] GET /api/options 500 …` and 08:20:53.532 `[handleError] Unauthenticated …`) carry the identical stack and the identical Shopify request id, so they are one request, not two causes. handleError took its `else` branch (errorService.js:14), i.e. getCurrentUser(ctx) returned nothing — ctx.state.user was never populated, so the throw happened before verifyEmbedRequest finished, not in the router. Corroboration: `[getOptions]` — the tag articleController.js:395 logs in its own catch, which swallows and sets ctx.status itself rather than rethrowing — has zero occurrences in the whole 24h of 2026-08-05, so the controller never ran. Of the middleware registered ahead of the router in handlers/api.js, only shopifyCharge (:51) and verifyEmbedRequest (:88) issue Shopify Admin REST calls, matching the `RestClient.<anonymous>` frame. HttpResponseError exposes the upstream status as `code`/`response.statusCode`, never `status`, so errorHandler.js:13 computed 500 and logged at logger.error, which is what reached the severity>=ERROR sink and paged. Trigger is transient, not a revoked token: exactly 4 lines containing '401 (Unauthorized)' exist in the entire day, all inside 113 ms (08:20:52.839–52.951, tags [getEnableBlocks], [getProductsGraphQL], [blockLoader], [getPostsGraphQL]) plus [handleFetchPdfFiles]/[shopifyRetryGraphQL] 'status code 401' at 52.818, then the 400 553 ms later on the same revision. The `16 UNAUTHENTICATED` stderr stream (12 lines, domains pvybike/swaddlean/avant-skincare/belleze/qcy) is unrelated background P6 Firestore noise on a different call path.

Confidence: `medium`

## Code
- `packages/functions/src/middleware/errorHandler.js:13` — `const status = err.status || 500` — @avada/shopify-api HttpResponseError has no `.status`, so the upstream 400 became a 500 and was logged at logger.error, firing the alert. Unchanged on master; MR 856 fixes exactly this line and is still open
- `packages/functions/src/services/errorService.js:14` — the `Unauthenticated` branch this alert's own message came from — proves getCurrentUser(ctx) was empty, so the throw preceded auth middleware completion
- `packages/functions/src/handlers/api.js:51` — shopifyCharge registered before the router — one of only two pre-route middlewares that issue Shopify Admin REST calls, matching the RestClient frame
- `packages/functions/src/handlers/api.js:88` — verifyEmbedRequest fallback — the other pre-route @avada/core middleware talking to Shopify Admin and populating ctx.state.user
- `packages/functions/src/controllers/articleController.js:395` — getOptions logs `[getOptions]` in its own catch and never rethrows; that tag is absent from the whole 24h day, so the controller is excluded as the source

## Evidence
- 2 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-05T00:00:00Z" AND timestamp<="2026-08-06T00:00:00Z" AND jsonPayload.message:"400 Bad Request) from Shopify"`
- 4 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-05T00:00:00Z" AND timestamp<="2026-08-06T00:00:00Z" AND jsonPayload.message:"401 (Unauthorized)"`
- 6 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-05T08:20:52Z" AND timestamp<="2026-08-05T08:20:54Z" AND severity>=ERROR`
- 3 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-05T00:00:00Z" AND timestamp<="2026-08-06T00:00:00Z" AND jsonPayload.message:"kozjvGcNBaGdLMGB7Pxq"`

## Job
- analyze rounds: 1
- cost: $1.09
- MR: https://gitlab.com/avada/blogs/-/merge_requests/856

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
