fingerprint: 1rtg9x7
service: api
message: [getOptions] nrkjbmKkyf9JkdTeYH74 failed to load options RequestError: read ECONNRESET
app: BLOG
repo: blogs
date: 2026-09-18T13:59:53.552Z
status: fix_disabled
attempt: 1

# BLOG · api · 1rtg9x7

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** One Shopify Admin REST connection was reset (`read ECONNRESET`) during the unretried, unguarded `shopify.asset.list(theme.id)` call in getShopifyBlogPostThemes, and getOptions turns that transport error into an HTTP 500 for GET /api/options.

**Mechanism.** At 2026-09-18T13:57:37Z, GET /api/options for shop nrkjbmKkyf9JkdTeYH74 (from the blogEditor embed) ran getOptions. On a cache miss it runs Promise.all over three calls: getShopifyBlogs, getAuthor and getShopifyBlogPostThemes. getShopifyBlogs catches every error and returns []. getAuthor is a Firestore read that catches and returns {data: []}. Inside getShopifyBlogPostThemes, getMainTheme wraps theme.list in try/catch and returns {}. So the only Shopify call (through got) that can reject is the bare `shopify.asset.list(theme.id)`. That call gets no retry at any layer. initShopify sets `autoLimit: true`, which shopify-api-node does not allow together with `maxRetries`, so maxRetries stays at 0 and got runs with `retry = 0` (node_modules/shopify-api-node/index.js:56,66,192). ECONNRESET is in the library's own retryable list, but that list is never used. It is not wrapped in shopifyRetryApi either, and shopifyRetryError only matches 429/430/502/503 anyway. The got RequestError (`code: ECONNRESET`, stack at got/dist/source/core/index.js:970, TLSSocket.socketErrorListener) reaches the getOptions catch. There `error.response` is undefined, so the status falls through to 500. Timing fits: the request log is at 13:57:37.169Z with latency 1.011s, and the [getOptions] error line is at 13:57:38.181Z, 1.012s later on the same instance 00a41e8c1dcda803…. Scale: this is the only [getOptions] error and the only /api/options 500 in 7 days, against 1999+ 200s (the read hit its 2000-entry limit). So it is a one-off transient network reset that the code turned into a user-facing 500. It is not a recurring upstream fault. The 6 `[update] … Can’t set isPublished to true and also set a future publish date` ERRORs in the same window are a separate cause (PUT /api/article, answered 200 {success:false}) and do not belong to this fingerprint.

Confidence: `medium`

## Code
- `packages/functions/src/services/shopifyService.js:93` — `await shopify.asset.list(theme.id)`: the only unguarded, unretried got call on the getOptions path. Its ECONNRESET propagates.
- `packages/functions/src/services/shopifyService.js:30` — initShopify sets `autoLimit: true`, so shopify-api-node forces maxRetries 0 and got retry 0. Transport errors like ECONNRESET are never retried.
- `packages/functions/src/services/shopifyService.js:62` — getShopifyBlogs swallows all errors, so the rejection cannot come from blog.list.
- `packages/functions/src/services/shopifyService.js:129` — getMainTheme swallows theme.list failures and returns {}, so the rejection cannot come from theme.list.
- `packages/functions/src/services/shopifyService.js:166` — shopifyRetryError only matches 429/430/502/503 status codes. Wrapping asset.list in shopifyRetryApi as-is would still not retry ECONNRESET.
- `packages/functions/src/controllers/articleController.js:418` — Promise.all over blogs/authors/themes. A rejection from getShopifyBlogPostThemes fails the whole options load.
- `packages/functions/src/controllers/articleController.js:437` — The got RequestError has no response.statusCode or status, so the status falls to 500. This produced the alerted HTTP 500.

## Evidence
- 1 matching entries: `resource.labels.service_name="api" AND jsonPayload.message:"[getOptions]" AND timestamp>="2026-09-11T00:00:00Z" AND timestamp<="2026-09-18T14:12:40.830Z"`
- 1 matching entries: `resource.labels.service_name="api" AND httpRequest.requestUrl:"/api/options" AND httpRequest.status>=500 AND timestamp>="2026-09-11T00:00:00Z" AND timestamp<="2026-09-18T14:12:40.830Z"`
- 1999 matching entries: `resource.labels.service_name="api" AND httpRequest.requestUrl:"/api/options" AND httpRequest.status=200 AND timestamp>="2026-09-11T00:00:00Z" AND timestamp<="2026-09-18T14:12:40.830Z"`

## Job
- analyze rounds: 1
- cost: $1.76

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
