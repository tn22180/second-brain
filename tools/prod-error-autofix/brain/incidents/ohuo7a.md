fingerprint: ohuo7a
service: proxy
message: [getPostsByTag] <http://ca6rf1-q1.myshopify.com|ca6rf1-q1.myshopify.com> tag:  Error listing posts by tag HTTPError: Response code 500 (Internal Server Error)
app: BLOG
repo: blogs
date: 2026-08-04T08:57:55.100Z
status: mr_open
attempt: 1

# BLOG · proxy · ohuo7a

**Outcome.** duplicate of 1q0ihss — MR https://gitlab.com/avada/blogs/-/merge_requests/820

**Root cause.** During a 71-second Shopify Admin GraphQL brownout (08:51:01-08:52:10Z), getArticlesByTagWithPagination issued shopify.graphql through a client built by initShopify with autoLimit: true and no maxRetries -- which forces shopify-api-node to set options.retry = 0 -- so Shopify's HTTP 500 was never retried, and getPostsByTag's catch (which only special-cases 401/402/403) turned the upstream fault into an app 500 that paged.

**Mechanism.** ca6rf1-q1.myshopify.com's storefront (bjorkbitter.se) was being crawled by Googlebot; 4 GET /proxy/posts-by-tag?domain=ca6rf1-q1...&limit=6&search= arrived between 08:51:01 and 08:51:42 and all 4 answered 500. tag.controller.getPostsByTag:117 calls initShopify (shopifyService.js:23), which constructs `new Shopify({apiVersion, accessToken, shopName, autoLimit: true})` (shopifyService.js:30). shopify-api-node defaults maxRetries: 0 (node_modules/shopify-api-node/index.js:66) and its constructor rejects autoLimit + maxRetries together (index.js:56), so `if (this.options.maxRetries > 0)` at index.js:326 is false and every graphql POST is issued with `options.retry = 0` -- even though 500 IS in that library's own retryableStatusCodesArray (index.js:25). tag.service.js:246 then makes the single unretried `shopify.graphql(getArticleByTags678, queryParams)` call. Shopify answered two ways in the same window: a real HTTP 500, which got raises as HTTPError/ERR_NON_2XX_3XX_RESPONSE 'Response code 500 (Internal Server Error)' (the exact alert text), and HTTP 200 with an in-band `errors` array, which shopify-api-node's maybeError hook (index.js:299) rethrows and got wraps as RequestError/ERR_GOT_REQUEST_ERROR 'Internal error. Looks like something went wrong on our end. Request ID: ...'. Neither shape has statusCode 401/402/403, so isShopifyAuthError (tag.controller.js:19) is false, the catch falls through to logger.error + ctx.status = 500 (tag.controller.js:161), and the sink pages. That it was a transient upstream brownout and not this shop's data: /proxy/tags?domain=ca6rf1-q1 returned 200 in 0.599s at 08:51:01.022Z -- same shop, same second, a different Shopify GraphQL call that succeeded -- and 4 of the 8 brownout error lines belong to a second unrelated shop, psykah-e1.myshopify.com, across both /proxy/posts-by-tag and /proxy/tags. NOTE -- partial duplicate: open MR 827 (fingerprint ha4bhr, branch fix/prod-blog-ha4bhr, unmerged) already wraps tag.service.js:176 and :246 in withStorefrontRetry, but its predicate isTransientShopifyGraphQlError requires `e?.response === undefined`, and got's HTTPError always carries `.response` (node_modules/got/dist/source/core/errors.d.ts:39). So MR 827 would have retried the 3 ERR_GOT_REQUEST_ERROR lines and would NOT have retried the 5 ERR_NON_2XX_3XX_RESPONSE lines -- including the one that produced this alert.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyService.js:30` — initShopify passes autoLimit: true and no maxRetries; shopify-api-node forbids both together and defaults maxRetries to 0, so every shopify.graphql call in this app runs with got retry disabled
- `packages/functions/src/services/tag.service.js:246` — the single unretried shopify.graphql(getArticleByTags678) that took Shopify's HTTP 500 -- the call in the alert stack
- `packages/functions/src/services/tag.service.js:176` — same unretried shopify.graphql pattern on the listStorefront path -- second symptom of the same cause, 3 of the 8 brownout error lines
- `packages/functions/src/controllers/tag.controller.js:19` — isShopifyAuthError only matches 401/402/403, so a Shopify 5xx is not classified as upstream and falls through to the paging branch
- `packages/functions/src/controllers/tag.controller.js:117` — getPostsByTag builds the retry-disabled client via initShopify inside the cache miss path
- `packages/functions/src/controllers/tag.controller.js:161` — ctx.status = 500 for an upstream Shopify fault -- this is what makes the httpRequest.status 500 that fired the alert
- `packages/functions/src/helpers/api.js:145` — RETRYABLE_STATUSES already lists 500 -- the repo's axios GraphQL path retries this exact status, proving the policy is intended; the shopify-api-node path never gets it
- `packages/functions/src/helpers/api.js:147` — shopifyRetryGraphQL is the existing retry wrapper, wired only into makeGraphQlApi and never into shopify.graphql calls

## Evidence
- 8 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-04T08:51:00Z" AND timestamp<="2026-08-04T08:52:15Z" AND (jsonPayload.tag="[getPostsByTag]" OR jsonPayload.tag="[listStorefront]")`
- 5 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-04T08:00:00Z" AND timestamp<="2026-08-04T09:10:00Z" AND httpRequest.requestUrl:"ca6rf1-q1"`
- 3 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-03T09:00:00Z" AND timestamp<="2026-08-04T09:10:00Z" AND jsonPayload.tag="[getPostsByTag]" AND jsonPayload.error.code="ERR_NON_2XX_3XX_RESPONSE"`
- 5 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-03T14:15:00Z" AND timestamp<="2026-08-03T14:17:00Z" AND jsonPayload.tag="[getPostsByTag]"`

## Job
- analyze rounds: 1
- cost: $2.95
- MR: https://gitlab.com/avada/blogs/-/merge_requests/820

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
