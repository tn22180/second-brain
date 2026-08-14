fingerprint: 1f3smxv
service: proxy
message: [getPostsByTag] <http://germaine-de-capuccini-au.myshopify.com|germaine-de-capuccini-au.myshopify.com> tag:  Error listing posts by tag HTTPError: Response code 503 (Service Unavailable)
app: BLOG
repo: blogs
date: 2026-08-14T02:18:58.631Z
status: mr_open
attempt: 1

# BLOG · proxy · 1f3smxv

**Outcome.** duplicate of 9rrq64 — MR https://gitlab.com/avada/blogs/-/merge_requests/871

**Root cause.** A one-off Shopify Admin GraphQL HTTP 503 on the single `articles` query in getArticlesByTagWithPagination became a hard 500 on /proxy/posts-by-tag, because the storefront tag path calls shopify.graphql() directly and shopify-api-node is built with autoLimit only — no 5xx retry — while the repo's own retry wrapper (which already lists 503 as retryable) is wired only to makeGraphQlApi.

**Mechanism.** germaine-de-capuccini-au.myshopify.com is a live install, not a dead one: 73 of 74 /proxy/* requests for that domain in the 24h to 2026-08-13T15:03Z returned 200, one returned 500 (1.35%). The failing request is GET /proxy/posts-by-tag?domain=germaine-de-capuccini-au.myshopify.com&limit=6&search= at 14:47:58.108Z, latency 4.786746618s, Baiduspider-render. search='' so `if (tag)` in getArticlesByTagWithPagination (tag.service.js:224) is false and the tag-resolution query is skipped — the only outbound call is shopify.graphql(getArticleByTags678, queryParams) at tag.service.js:246. That client is shopify-api-node constructed with `autoLimit: true` and nothing else (shopifyService.js:26-30); autoLimit is Shopify call-limit throttling, not 5xx retry, and got does not retry POST by default. Shopify answered 503, got threw HTTPError code ERR_NON_2XX_3XX_RESPONSE (jsonPayload.error.code in the log), which propagated through shopCacheService.withCache — it plainly awaits fetchFn at shopCache.service.js:106 with no stale-on-error path — up to getPostsByTag's catch. isShopifyAuthError (tag.controller.js:19) matches only 401/402/403 on e.statusCode/e.response.statusCode, so 503 falls through to the generic branch, which logs at severity ERROR (tag.controller.js:152 — the exact alert string) and sets ctx.status = 500 (tag.controller.js:161), producing the httpRequest.status 500 that paged. That the 401 path works is visible in the same window: msglamor.myshopify.com at 15:01:45.863Z logged the same tag at WARNING, not ERROR. The correct classifier already exists — RETRYABLE_STATUSES = [429,500,502,503,504,520] at api.js:145 — but shopifyRetryGraphQL is reachable only through makeGraphQlApi (api.js:128), and its retryability test reads e.response?.status (api.js:165, the axios shape) while a got HTTPError carries e.response.statusCode, so the wrapper must be widened as well as wired in.

Confidence: `high`

## Code
- `packages/functions/src/services/tag.service.js:246` — the unretried shopify.graphql(getArticleByTags678) call whose got HTTPError 503 is in the alert stack; with search='' this is the request's only outbound Shopify call
- `packages/functions/src/services/tag.service.js:224` — `if (tag)` is false for search='', so the tag-resolution query at :225 never runs — isolates the failure to :246
- `packages/functions/src/services/shopifyService.js:30` — initShopify builds the client with autoLimit only — call-limit throttling, no 5xx retry
- `packages/functions/src/controllers/tag.controller.js:19` — isShopifyAuthError absorbs only 401/402/403; a transient 503 falls through to the 500 branch
- `packages/functions/src/controllers/tag.controller.js:152` — logs '[getPostsByTag] … Error listing posts by tag' at severity ERROR — the literal alert message
- `packages/functions/src/controllers/tag.controller.js:161` — ctx.status = 500 for an upstream 503 — the status that paged
- `packages/functions/src/services/shopCache.service.js:106` — withCache awaits fetchFn and lets the rejection through — no stale-value fallback, so one upstream blip is user-facing
- `packages/functions/src/helpers/api.js:145` — RETRYABLE_STATUSES already contains 503 — the policy exists, this call path just does not use it
- `packages/functions/src/helpers/api.js:165` — retryability reads e.response?.status (axios shape) only; a got HTTPError carries e.response.statusCode, so the classifier must widen like isShopifyAuthError at :152 already did
- `packages/functions/src/helpers/api.js:128` — shopifyRetryGraphQL is reachable only through makeGraphQlApi, never through shopify.graphql

## Evidence
- 1 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-13T14:33:06Z" AND timestamp<="2026-08-13T15:03:07Z" AND jsonPayload.message:"503 (Service Unavailable)"`
- 74 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-12T15:00:00Z" AND timestamp<="2026-08-13T15:03:07Z" AND httpRequest.requestUrl:"germaine-de-capuccini-au"`
- 7 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-12T15:00:00Z" AND timestamp<="2026-08-13T15:03:07Z" AND httpRequest.status>=500`
- 2 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-13T14:33:06Z" AND timestamp<="2026-08-13T15:03:07Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $1.22
- MR: https://gitlab.com/avada/blogs/-/merge_requests/871

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
