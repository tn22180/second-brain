fingerprint: l1uerj
service: proxy
message: [getPostsByTag] <http://mantraherbalonline.myshopify.com|mantraherbalonline.myshopify.com> tag:  Error listing posts by tag HTTPError: Response code 404 (Not Found)
app: BLOG
repo: blogs
date: 2026-08-14T05:23:35.979Z
status: mr_open
attempt: 1

# BLOG · proxy · l1uerj

**Outcome.** duplicate of 9rrq64 — MR https://gitlab.com/avada/blogs/-/merge_requests/871

**Root cause.** Duplicate of fingerprints j5n4n6 / mgvvdq (MR https://gitlab.com/avada/blogs/-/merge_requests/827 open, unmerged — master still has the bare call): Shopify Admin GraphQL answered one isolated POST with HTTP 404 at 04:16:34.4Z for mantraherbalonline.myshopify.com, and getArticlesByTagWithPagination calls shopify.graphql() bare — no retry, and 404 is in neither the retryable-status list nor the auth-error list — so a transient upstream 404 became a hard 500 on /proxy/posts-by-tag.

**Mechanism.** GET /proxy/posts-by-tag?domain=mantraherbalonline.myshopify.com&limit=6&search= → tag.controller.getPostsByTag (tag.controller.js:106) → shopCacheService.withCache (miss, tag.controller.js:110) → tag.service.getArticlesByTagWithPagination → `await shopify.graphql(getArticleByTags678, queryParams)` (tag.service.js:246). shopify-api-node uses got, which throws HTTPError ERR_NON_2XX_3XX_RESPONSE 'Response code 404 (Not Found)' — matching the alert stack frame got/dist/source/as-promise/index.js:118. That call never passes through shopifyRetryGraphQL (helpers/api.js:154), so retry count is zero; even in that path 404 is absent from RETRYABLE_STATUSES (api.js:145) and the classifier reads e.response?.status (api.js:165), an axios field got never sets (got carries e.response.statusCode), so no status branch would fire for a shopify-api-node error at all. The controller catch guard isShopifyAuthError absorbs only 401/402/403 (tag.controller.js:19), so the 404 falls through to logger.error (tag.controller.js:153 — the literal alert line) and ctx.status = 500 (tag.controller.js:161). The 404 is transient, not a dead store or a missing shop: /proxy/tags for the SAME shop returned 200 in 0.427s at 04:16:34.190932Z, the 500 landed at 04:16:34.211719Z, and the immediately following /proxy/posts-by-tag for the same shop and same params returned 200 in 0.311s at 04:16:34.510743Z — three requests inside 320ms, only the middle one 404ed. Separate and unrelated cause in the same window: 400+ (query-limit-capped) 'The request failed because the instance could not start successfully' request logs on the same service in a 36-second burst 04:31:02–04:31:38Z, which is infra, not this alert.

Confidence: `high`

## Code
- `packages/functions/src/services/tag.service.js:246` — getArticlesByTagWithPagination issues getArticleByTags678 through a bare, unretried shopify.graphql() — the call whose got rejection is the 404 HTTPError in the alert
- `packages/functions/src/services/tag.service.js:176` — getTagsForStorefront has the identical bare shopify.graphql(getArticleTagsList) — same defect, produced the sibling [listStorefront] 404 at 04:14:11Z
- `packages/functions/src/controllers/tag.controller.js:19` — isShopifyAuthError absorbs only 401/402/403, so a transient 404 skips the graceful empty-data branch
- `packages/functions/src/controllers/tag.controller.js:153` — logger.error('[getPostsByTag]', domain, 'Error listing posts by tag', e) — the exact string in the alert
- `packages/functions/src/controllers/tag.controller.js:161` — ctx.status = 500 for a transient upstream 404; this produced the httpRequest.status 500 that fired the page
- `packages/functions/src/helpers/api.js:145` — RETRYABLE_STATUSES = [429,500,502,503,504,520] — no 404, so the shared retry helper would not retry this even if it were in the path
- `packages/functions/src/helpers/api.js:165` — retry classification reads e.response?.status (axios); got errors carry e.response.statusCode, so no shopify-api-node error ever matches a status branch

## Evidence
- 2 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-14T04:01:39Z" AND timestamp<="2026-08-14T04:31:39Z" AND jsonPayload.error.message:"404"`
- 3 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T04:31:39Z" AND httpRequest.requestUrl:"mantraherbalonline"`
- 400 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-14T04:01:39Z" AND timestamp<="2026-08-14T04:31:39Z" AND textPayload:"instance could not start"`
- 5 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-14T04:01:39Z" AND timestamp<="2026-08-14T04:31:39Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $1.36
- MR: https://gitlab.com/avada/blogs/-/merge_requests/871

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
