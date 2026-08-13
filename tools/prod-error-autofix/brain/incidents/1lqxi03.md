fingerprint: 1lqxi03
service: proxy
message: [getPostsByTag] <http://2a3304-52.myshopify.com|2a3304-52.myshopify.com> tag:  Error listing posts by tag HTTPError: Response code 502 (Bad Gateway)
app: BLOG
repo: blogs
date: 2026-08-12T18:32:21.868Z
status: mr_open
attempt: 1

# BLOG · proxy · 1lqxi03

**Outcome.** duplicate of 9rrq64 — MR https://gitlab.com/avada/blogs/-/merge_requests/871

**Root cause.** The single Shopify Admin GraphQL call in getArticlesByTagWithPagination (tag.service.js:246) is issued through the bare `shopify.graphql` client built by initShopify, which has no retry for 5xx, so one transient Shopify 502 on 2026-08-11T17:22:56Z propagated straight to getPostsByTag's catch and became the HTTP 500 that paged. Same defect and same handler as fingerprint 9rrq64 (MR https://gitlab.com/avada/blogs/-/merge_requests/871, open and unmerged — the bare call is still on master).

**Mechanism.** Googlebot-fronted request GET /proxy/posts-by-tag?domain=2a3304-52.myshopify.com&limit=6&search= (remoteIp 66.249.82.70) entered getPostsByTag (tag.controller.js:106). `search` is empty, so the cache miss ran the loader: getShopByField found the shop, initShopify (shopifyService.js:23) built a shopify-api-node client with only `autoLimit: true` — no retry wrapper — and getArticlesByTagWithPagination took the `tag` falsy branch, skipping the getArticleTagsList call, leaving exactly one network call: `shopify.graphql(getArticleByTags678, queryParams)` at tag.service.js:246. Shopify answered HTTP 502 after 5.16s; got rejected with HTTPError ERR_NON_2XX_3XX_RESPONSE 'Response code 502 (Bad Gateway)' (stack lands in got/as-promise/index.js:118). The controller's catch tested isShopifyAuthError (tag.controller.js:131), which only covers 401/402/403, so 502 fell through to logger.error at tag.controller.js:152 — producing the exact alert string — and ctx.status = 500 at tag.controller.js:161. The repo already has a retry helper that treats 502 as retryable (helpers/api.js:145 RETRYABLE_STATUSES, used by makeGraphQlApi), and shopifyService has shopifyRetryApi/shopifyRetryError with 502 in its code list (shopifyService.js:160), but this call path uses neither.

Confidence: `high`

## Code
- `packages/functions/src/services/tag.service.js:246` — the single unretried shopify.graphql(getArticleByTags678) call whose got rejection is the HTTPError 502 in the alert
- `packages/functions/src/controllers/tag.controller.js:118` — getPostsByTag's cache loader calls getArticlesByTagWithPagination — the only Shopify call in this request, since search='' skips the tag-list lookup
- `packages/functions/src/controllers/tag.controller.js:131` — isShopifyAuthError only matches 401/402/403, so a transient 502 is not classified as non-app-fault and falls through to the error path
- `packages/functions/src/controllers/tag.controller.js:152` — logger.error('[getPostsByTag]', domain, 'tag:', search, 'Error listing posts by tag', e) — emits the literal alert message at severity ERROR
- `packages/functions/src/controllers/tag.controller.js:161` — ctx.status = 500 — turns one upstream 502 into the httpRequest.status 500 that fired the page
- `packages/functions/src/services/shopifyService.js:23` — initShopify returns a raw shopify-api-node client with autoLimit only; no 5xx retry on shopify.graphql
- `packages/functions/src/services/shopifyService.js:160` — shopifyRetryError already lists 502 as retryable, but only shopifyRetryApi (REST) uses it — the storefront tag path does not
- `packages/functions/src/helpers/api.js:145` — RETRYABLE_STATUSES includes 502 in shopifyRetryGraphQL, the existing helper this call path bypasses

## Evidence
- 1 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-10T00:00:00Z" AND timestamp<="2026-08-12T00:00:00Z" AND jsonPayload.error.message:"502 (Bad Gateway)"`
- 1 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-11T16:00:00Z" AND timestamp<="2026-08-11T18:30:00Z" AND httpRequest.status>=500`
- 2 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy" OR resource.labels.job_name="proxy") AND timestamp>="2026-08-11T17:08:12.208Z" AND timestamp<="2026-08-11T17:38:12.208Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.30
- MR: https://gitlab.com/avada/blogs/-/merge_requests/871

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
