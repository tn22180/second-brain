fingerprint: 1ib8ldr
service: proxy
message: HTTP 500 GET /proxy/posts-by-tag
app: BLOG
repo: blogs
date: 2026-07-31T14:11:12.445Z
status: deferred
attempt: 1

# BLOG · proxy · 1ib8ldr

**Outcome.** MR deferred by mr_per_repo_per_day

**Root cause.** Shopify's Admin GraphQL answered a single transient HTTP 503 to two otherwise-healthy shops, and the storefront tag path has no retry — initShopify builds the client with `autoLimit: true`, which shopify-api-node treats as mutually exclusive with `maxRetries`, so maxRetries stays 0, got's retry is disabled, and the one-off 503 propagates straight to `ctx.status = 500`.

**Mechanism.** Both 500s in the alert window are HTTPError ERR_NON_2XX_3XX_RESPONSE 'Response code 503 (Service Unavailable)' thrown by got inside shopify-api-node (stack /workspace/node_modules/got/dist/source/as-promise/index.js:118:42, identical in both stderr entries). Path: listStorefront (tag.controller.js:76 withCache miss → initShopify → getTagsForStorefront) issues shopify.graphql(getArticleTagsList) at tag.service.js:176; getPostsByTag (tag.controller.js:107 → getArticlesByTagWithPagination) issues shopify.graphql(getArticleByTags678) at tag.service.js:246. initShopify (shopifyService.js:23) passes autoLimit: true (shopifyService.js:30) and no maxRetries; shopify-api-node's constructor rejects the combination (node_modules/shopify-api-node/index.js:56 throws on `options.autoLimit && options.maxRetries`), so maxRetries defaults to 0 (index.js:66) and the request is built with `options.retry = 0` (index.js:192) — even though 503 is in that library's own retryableStatusCodesArray (index.js:24-26). The rejection reaches the controller catch; isShopifyAuthError (tag.controller.js:19) only matches 401/402/403, so a 503 falls through to logger.error and ctx.status = 500 at tag.controller.js:98 (listStorefront) and :161 (getPostsByTag). The failure is per-request, not per-shop: at 13:04:14.725 /proxy/tags for 13b148-e5 returned 500 while /proxy/posts-by-tag for the same shop returned 200 at 13:04:14.751, and at 13:01:39.798 /proxy/posts-by-tag for 84be78-2 returned 500 while /proxy/tags for it returned 200 at 13:01:39.796 — 18 of 20 requests for these two domains in the 40-minute window were 200. Latencies 0.688s and 1.844s, i.e. immediate upstream rejection, not saturation. Rare: 2 such 503s on proxy in 7 days.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyService.js:30` — autoLimit: true with no maxRetries — the combination shopify-api-node forbids, so maxRetries stays 0 and got retry is disabled for every Shopify call built here
- `packages/functions/src/services/shopifyService.js:23` — initShopify, the single constructor used by both storefront tag paths
- `packages/functions/src/controllers/tag.controller.js:19` — isShopifyAuthError covers only 401/402/403; a transient 5xx is not classified and falls through to the 500 branch
- `packages/functions/src/controllers/tag.controller.js:161` — ctx.status = 500 on getPostsByTag — the endpoint named in the alert
- `packages/functions/src/controllers/tag.controller.js:98` — ctx.status = 500 on listStorefront — the second 500 in the same window
- `packages/functions/src/controllers/tag.controller.js:152` — catch logs '[getPostsByTag] <domain> tag: Error listing posts by tag' — verbatim message in the window's stderr entry
- `packages/functions/src/controllers/tag.controller.js:96` — catch logs '[listStorefront] <domain> Error listing storefront tags' — verbatim message in the other stderr entry
- `packages/functions/src/services/tag.service.js:176` — shopify.graphql(getArticleTagsList) in getTagsForStorefront — the call whose got rejection is the 503 HTTPError on the /proxy/tags path
- `packages/functions/src/services/tag.service.js:246` — shopify.graphql(getArticleByTags678) in getArticlesByTagWithPagination — same for /proxy/posts-by-tag

## Evidence
- 2 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-07-31T12:46:42.672Z" AND timestamp<="2026-07-31T13:16:42.672Z" AND jsonPayload.error.message:"Response code 503"`
- 2 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-07-31T12:46:42.672Z" AND timestamp<="2026-07-31T13:16:42.672Z" AND httpRequest.status>=500`
- 20 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-07-31T12:40:00Z" AND timestamp<="2026-07-31T13:20:00Z" AND httpRequest.requestUrl:("13b148-e5" OR "84be78-2")`
- 2 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-07-24T00:00:00Z" AND jsonPayload.error.message:"503"`

## Job
- analyze rounds: 1
- cost: $1.23

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
