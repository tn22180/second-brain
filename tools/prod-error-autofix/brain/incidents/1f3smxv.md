fingerprint: 1f3smxv
service: proxy
message: [getPostsByTag] <http://84be78-2.myshopify.com|84be78-2.myshopify.com> tag:  Error listing posts by tag HTTPError: Response code 503 (Service Unavailable)
app: BLOG
repo: blogs
date: 2026-07-31T14:08:15.639Z
status: deferred
attempt: 1

# BLOG · proxy · 1f3smxv

**Outcome.** MR deferred by mr_per_repo_per_day

**Root cause.** Shopify's Admin GraphQL API returned a one-off HTTP 503 for two healthy shops, and the storefront tag path calls shopify.graphql() directly with no retry — the repo's own retry wrapper (which already lists 503 as retryable) is wired only to makeGraphQlApi, so a single transient upstream blip becomes a hard 500 on /proxy/tags and /proxy/posts-by-tag.

**Mechanism.** 13b148-e5.myshopify.com and 84be78-2.myshopify.com are live, not dead installs: 451 of 453 /proxy/tags + /proxy/posts-by-tag requests for those two domains returned 200 in the 24h window (0.44% failure). The two failures are per-request, not per-shop — at 13:04:14.725 /proxy/tags returned 500 while the sibling /proxy/posts-by-tag for the same shop returned 200 26ms later (13:04:14.751); at 13:01:39.798 /proxy/posts-by-tag returned 500 while /proxy/tags returned 200 2ms earlier. So Shopify failed one GraphQL POST and served the concurrent one. listStorefront (tag.controller.js:82) and getPostsByTag (tag.controller.js:118) go through shopCacheService.withCache, which just awaits fetchFn (shopCache.service.js:106) and has no stale-on-error path, into getTagsForStorefront / getArticlesByTagWithPagination, which issue shopify.graphql(...) (tag.service.js:176, :225, :246). That client is shopify-api-node built with only autoLimit: true (shopifyService.js:26) — autoLimit is call-limit throttling, not 5xx retry, and got does not retry POST by default. The got HTTPError (ERR_NON_2XX_3XX_RESPONSE, status at e.response.statusCode) propagates up. isShopifyAuthError (tag.controller.js:19) matches only 401/402/403, so 503 falls through to the generic catch, which logs at severity ERROR (tag.controller.js:96, :152) and sets ctx.status = 500 (tag.controller.js:98, :161) — the httpRequest.status 500 that fired the page. The repo already has the correct classifier, shopifyRetryGraphQL with RETRYABLE_STATUSES = [429,500,502,503,504,520] (api.js:145), but it is reachable only via makeGraphQlApi (api.js:128), and its status extraction reads e.response?.status (api.js:154) — the axios shape — so it would not classify a got HTTPError even if reused as-is.

Confidence: `high`

## Code
- `packages/functions/src/controllers/tag.controller.js:19` — isShopifyAuthError only absorbs 401/402/403; a transient 503 falls through to the 500 branch
- `packages/functions/src/controllers/tag.controller.js:96` — logs '[listStorefront] ... Error listing storefront tags' at severity ERROR — exact string in the alert's sibling entry
- `packages/functions/src/controllers/tag.controller.js:98` — ctx.status = 500 for an upstream 503 — the status that paged
- `packages/functions/src/controllers/tag.controller.js:152` — logs '[getPostsByTag] ... Error listing posts by tag' — literal message in the alert
- `packages/functions/src/controllers/tag.controller.js:161` — ctx.status = 500 on the getPostsByTag path
- `packages/functions/src/services/tag.service.js:176` — getTagsForStorefront issues shopify.graphql(getArticleTagsList) with no retry — the call whose got rejection is in the stack
- `packages/functions/src/services/tag.service.js:246` — getArticlesByTagWithPagination issues shopify.graphql(getArticleByTags678) with no retry
- `packages/functions/src/services/shopifyService.js:26` — initShopify builds the client with autoLimit only — call-limit throttling, no 5xx retry
- `packages/functions/src/helpers/api.js:145` — RETRYABLE_STATUSES already contains 503 — the policy exists, this path just does not use it
- `packages/functions/src/helpers/api.js:154` — classifier reads e.response?.status (axios shape); a got HTTPError carries e.response.statusCode, so it must be widened to cover shopify-api-node
- `packages/functions/src/helpers/api.js:128` — shopifyRetryGraphQL is reachable only through makeGraphQlApi, not through shopify.graphql
- `packages/functions/src/services/shopCache.service.js:106` — withCache awaits fetchFn and rethrows — no stale-value fallback, so one upstream blip is a user-facing 500

## Evidence
- 2 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-07-30T13:00:00Z" AND jsonPayload.message:"503 (Service Unavailable)"`
- 3 matching entries: `timestamp>="2026-07-29T00:00:00Z" AND jsonPayload.message:"503 (Service Unavailable)"`
- 453 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-07-30T13:00:00Z" AND timestamp<="2026-07-31T13:30:00Z" AND (httpRequest.requestUrl:"13b148-e5" OR httpRequest.requestUrl:"84be78-2")`
- 200 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-07-24T00:00:00Z" AND (httpRequest.requestUrl:"13b148-e5" OR httpRequest.requestUrl:"84be78-2")`

## Job
- analyze rounds: 1
- cost: $1.51

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
