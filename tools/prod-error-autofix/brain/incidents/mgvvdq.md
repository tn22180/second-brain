fingerprint: mgvvdq
service: proxy
message: [listStorefront] <http://41e513.myshopify.com|41e513.myshopify.com> Error listing storefront tags HTTPError: Response code 502 (Bad Gateway)
app: BLOG
repo: blogs
date: 2026-08-12T16:45:23.597Z
status: mr_open
attempt: 1

# BLOG · proxy · mgvvdq

**Outcome.** duplicate of q3fla3 — MR https://gitlab.com/avada/blogs/-/merge_requests/827

**Root cause.** A single transient Shopify Admin GraphQL HTTP 502 on the unretried `shopify.graphql(getArticleTagsList)` call inside getTagsForStorefront propagated to tag.controller.listStorefront's catch, which only degrades 401/402/403 and so turned the upstream 502 into the alerted HTTP 500 — same defect as fingerprint 1q0ihss (MR https://gitlab.com/avada/blogs/-/merge_requests/820, open and unmerged; master still has the bare call).

**Mechanism.** GET /proxy/tags?domain=41e513.myshopify.com&limit=20&orderBy=updatedAt+desc (referer kailashenergy.com, Instagram in-app webview) missed the shopCacheService entry, so listStorefront ran the loader: getShopByField(domain) → initShopify(shop) → getTagsForStorefront(shopify, query). initShopify builds shopify-api-node 3.15.0 with `autoLimit: true` and no maxRetries (packages/functions/src/services/shopifyService.js:26); the constructor rejects both together, so maxRetries stays 0 and got's built-in retryableStatusCodes path is disabled. The one `await shopify.graphql(getArticleTagsList)` at tag.service.js:176 therefore threw got HTTPError ERR_NON_2XX_3XX_RESPONSE 'Response code 502 (Bad Gateway)' on the first attempt — request latency 0.168884716s confirms a single attempt with no backoff. In listStorefront's catch, isShopifyAuthError (tag.controller.js:19) matches only 401/402/403, so the 502 fell through to logger.error at tag.controller.js:96 and ctx.status = 500 at tag.controller.js:98. The shared retry helper would not have saved it either: shopifyRetryGraphQL classifies retryability with `e.response?.status` (packages/functions/src/helpers/api.js:165), but got's HTTPError carries the code at `e.response.statusCode` — the same axios/got field mismatch already noted in the isShopifyAuthError comment three lines above — so 502 would not match RETRYABLE_STATUSES even if the call were wrapped.

Confidence: `high`

## Code
- `packages/functions/src/services/tag.service.js:176` — the single unguarded `await shopify.graphql(getArticleTagsList)` that threw the got HTTPError 502
- `packages/functions/src/services/shopifyService.js:26` — client built with autoLimit:true and no maxRetries; shopify-api-node throws if both are set, so retries can never be enabled and every Shopify 5xx is fatal on the first attempt
- `packages/functions/src/controllers/tag.controller.js:19` — isShopifyAuthError covers only 401/402/403, so an upstream 502 is not treated as a degradable condition
- `packages/functions/src/controllers/tag.controller.js:98` — ctx.status = 500 — the line that turned the transient upstream 502 into the alerted HTTP 500 on a public storefront route
- `packages/functions/src/helpers/api.js:165` — RETRYABLE_STATUSES is tested against e.response?.status, which got never sets (it uses e.response.statusCode), so wrapping the call in shopifyRetryGraphQL as-is would still not retry a 502

## Evidence
- 1 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-09T18:15:22Z" AND timestamp<="2026-08-09T18:45:23Z" AND jsonPayload.tag="[listStorefront]"`
- 1 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-09T18:15:22Z" AND timestamp<="2026-08-09T18:45:23Z" AND httpRequest.status>=500 AND httpRequest.requestUrl:"/proxy/tags"`
- 1 matching entries: `timestamp>="2026-08-09T00:00:00Z" AND timestamp<="2026-08-10T00:00:00Z" AND jsonPayload.error.message="Response code 502 (Bad Gateway)"`

## Job
- analyze rounds: 1
- cost: $1.11
- MR: https://gitlab.com/avada/blogs/-/merge_requests/827

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
