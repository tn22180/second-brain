fingerprint: q3fla3
service: proxy
message: [listStorefront] <http://psykah-e1.myshopify.com|psykah-e1.myshopify.com> Error listing storefront tags HTTPError: Response code 500 (Internal Server Error)
app: BLOG
repo: blogs
date: 2026-08-04T09:01:43.250Z
status: mr_open
attempt: 1

# BLOG · proxy · q3fla3

**Outcome.** duplicate of qftd5e — MR https://gitlab.com/avada/blogs/-/merge_requests/827

**Root cause.** A ~133-second Shopify Admin GraphQL brownout (08:51:19–08:53:32Z) returned HTTP 500 to getTagsForStorefront's and getArticlesByTagWithPagination's shopify.graphql calls; the client initShopify builds has retry disabled, so a single transient upstream 500 propagated straight through tag.controller's catch — which only special-cases 401/402/403 — and became an app 500 that paged. Duplicate of fingerprints 1q0ihss / ohuo7a (MR https://gitlab.com/avada/blogs/-/merge_requests/820, branch fix/prod-blog-1q0ihss-a2, open and unmerged — its withShopifyRetry wraps exactly the two calls in this alert).

**Mechanism.** 9 error lines in the window across 3 unrelated shops (ca6rf1-q1, psykah-e1, meister-group-frankfurt) and both storefront endpoints — 6× ERR_NON_2XX_3XX_RESPONSE 'Response code 500' and 3× ERR_GOT_REQUEST_ERROR 'Internal error … Request ID: <uuid>' (Shopify's in-band GraphQL error body, rethrown by shopify-api-node's maybeError at node_modules/shopify-api-node/index.js:299). The alerting line, [listStorefront] psykah-e1 at 08:52:10.242Z, comes from tag.service.js:176 `await shopify.graphql(getArticleTagsList)`. That client is built by initShopify (shopifyService.js:23) as `new Shopify({apiVersion, accessToken, shopName, autoLimit: true})` with no maxRetries (shopifyService.js:30); shopify-api-node's constructor forbids autoLimit + maxRetries together and defaults maxRetries to 0, so `if (this.options.maxRetries > 0)` never fires and every graphql POST is issued with got `retry = 0` — even though 500 is in that library's own retryableStatusCodesArray. got raises HTTPError, isShopifyAuthError (tag.controller.js:19) sees statusCode 500 and returns false, so control reaches logger.error (tag.controller.js:96) and ctx.status = 500 (tag.controller.js:98), producing the httpRequest 500 the sink pages on. Proof it was transient upstream and not shop data: meister-group-frankfurt's GET /proxy/tags answered 500 in 0.492s at 08:53:31.521Z and the identical URL answered 200 in 0.269s at 08:53:32.184Z — same shop, same query, 0.66s later. One retry would have absorbed it. The repo already treats 500 as retryable on its other Shopify path (helpers/api.js:145 RETRYABLE_STATUSES) but that wrapper is never wired into shopify.graphql.

Confidence: `high`

## Code
- `packages/functions/src/services/tag.service.js:176` — getTagsForStorefront's unretried shopify.graphql(getArticleTagsList) — the call that took Shopify's 500 in the alerting [listStorefront] line
- `packages/functions/src/services/tag.service.js:246` — getArticlesByTagWithPagination's unretried shopify.graphql(getArticleByTags678) — same defect on the [getPostsByTag] path, 5 of the 9 error lines
- `packages/functions/src/services/shopifyService.js:30` — initShopify passes autoLimit: true with no maxRetries; shopify-api-node forbids both together and defaults maxRetries to 0, so got retry is disabled for every shopify.graphql call in this app
- `packages/functions/src/controllers/tag.controller.js:19` — isShopifyAuthError matches only 401/402/403, so a Shopify 5xx is not classified as upstream and falls through to the paging branch
- `packages/functions/src/controllers/tag.controller.js:96` — logger.error('[listStorefront]', …) — emits the exact alert text with severity ERROR
- `packages/functions/src/controllers/tag.controller.js:98` — ctx.status = 500 for an upstream Shopify fault — the httpRequest.status that fired the sink
- `packages/functions/src/helpers/api.js:145` — RETRYABLE_STATUSES already lists 500 on the axios GraphQL path — the retry policy is intended repo-wide but never reaches the shopify-api-node path

## Evidence
- 9 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-04T08:40:00Z" AND timestamp<="2026-08-04T09:10:00Z" AND (jsonPayload.tag="[getPostsByTag]" OR jsonPayload.tag="[listStorefront]")`
- 4 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-04T07:00:00Z" AND timestamp<="2026-08-04T09:10:00Z" AND httpRequest.requestUrl:"meister-group-frankfurt"`
- 9 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-04T08:37:04.247Z" AND timestamp<="2026-08-04T09:07:04.247Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $1.28
- MR: https://gitlab.com/avada/blogs/-/merge_requests/827

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
