fingerprint: lajh7i
service: proxy
message: [listStorefront] <http://13b148-e5.myshopify.com|13b148-e5.myshopify.com> Error listing storefront tags HTTPError: Response code 503 (Service Unavailable)
app: BLOG
repo: blogs
date: 2026-07-31T14:37:15.996Z
status: deferred
attempt: 1

# BLOG · proxy · lajh7i

**Outcome.** MR deferred by mr_per_repo_per_day

**Root cause.** Shopify's Admin GraphQL answered a transient HTTP 503 to two otherwise-healthy shops, and the storefront tag path has no retry — initShopify builds every client with `autoLimit: true`, which shopify-api-node treats as mutually exclusive with `maxRetries`, so maxRetries stays 0, got's retry is disabled, and a one-off 503 propagates straight to `ctx.status = 500`. Same event set as fingerprints 1ib8ldr and 1f3smxv (both deferred, no MR).

**Mechanism.** Both 500s in the window are got HTTPError ERR_NON_2XX_3XX_RESPONSE 'Response code 503 (Service Unavailable)' thrown inside shopify-api-node — identical stack /workspace/node_modules/got/dist/source/as-promise/index.js:118:42 in both stderr entries. Path A: GET /proxy/tags?domain=13b148-e5.myshopify.com → listStorefront (tag.controller.js:68), cache miss → initShopify (tag.controller.js:81) → getTagsForStorefront → shopify.graphql(getArticleTagsList) at tag.service.js:176. Path B: GET /proxy/posts-by-tag?domain=84be78-2.myshopify.com → getPostsByTag (tag.controller.js:106) → getArticlesByTagWithPagination → shopify.graphql(getArticleByTags678) at tag.service.js:246. initShopify (shopifyService.js:23) passes `autoLimit: true` (shopifyService.js:30) and never sets maxRetries; shopify-api-node throws if both are set, so maxRetries defaults to 0 and each request is built with got `retry: 0` — even though 503 is in that library's own retryable-status list. The rejection reaches the controller catch; isShopifyAuthError (tag.controller.js:19) matches only 401/402/403, so a 5xx falls through to logger.error and ctx.status = 500 at tag.controller.js:98 (listStorefront) and tag.controller.js:161 (getPostsByTag) — producing the two log messages verbatim. Latencies 1.844s and 0.688s: immediate upstream rejection, not saturation, so this is not maxInstances (P5). Not P2/P3/P6.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyService.js:30` — autoLimit: true with no maxRetries — the combination shopify-api-node forbids, so maxRetries stays 0 and got retry is disabled for every Shopify call built here
- `packages/functions/src/services/shopifyService.js:23` — initShopify, the single client constructor used by both storefront tag paths
- `packages/functions/src/controllers/tag.controller.js:19` — isShopifyAuthError covers only 401/402/403; a transient 5xx is unclassified and falls to the 500 branch
- `packages/functions/src/controllers/tag.controller.js:96` — catch logs '[listStorefront] <domain> Error listing storefront tags' — verbatim message of the alert
- `packages/functions/src/controllers/tag.controller.js:98` — ctx.status = 500 on listStorefront — the endpoint in the alert
- `packages/functions/src/controllers/tag.controller.js:152` — catch logs '[getPostsByTag] <domain> tag: Error listing posts by tag' — verbatim message of the second stderr entry
- `packages/functions/src/controllers/tag.controller.js:161` — ctx.status = 500 on getPostsByTag — the second 500 in the same window
- `packages/functions/src/services/tag.service.js:176` — shopify.graphql(getArticleTagsList) in getTagsForStorefront — the call whose got rejection is the 503 on /proxy/tags
- `packages/functions/src/services/tag.service.js:246` — shopify.graphql(getArticleByTags678) in getArticlesByTagWithPagination — same for /proxy/posts-by-tag

## Evidence
- 2 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-07-31T12:49:18.632Z" AND timestamp<="2026-07-31T13:19:18.632Z" AND jsonPayload.error.message:"Response code 503"`
- 2 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-07-31T12:49:18.632Z" AND timestamp<="2026-07-31T13:19:18.632Z" AND httpRequest.status>=500`
- 20 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-07-31T12:40:00Z" AND timestamp<="2026-07-31T13:20:00Z" AND httpRequest.requestUrl:("13b148-e5" OR "84be78-2")`
- 2 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-07-24T00:00:00Z" AND jsonPayload.error.message:"503"`

## Job
- analyze rounds: 1
- cost: $0.81

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
