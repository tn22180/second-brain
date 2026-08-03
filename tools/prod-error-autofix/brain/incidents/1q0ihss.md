fingerprint: 1q0ihss
service: proxy
message: HTTP 500 GET /proxy/tags
app: BLOG
repo: blogs
date: 2026-08-03T05:29:48.390Z
status: mr_open
attempt: 2

# BLOG · proxy · 1q0ihss

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/820

**Root cause.** A single transient Shopify Admin GraphQL HTTP 503 on getArticleTagsList went unretried — initShopify builds the shopify-api-node client with `autoLimit: true`, which forces `maxRetries: 0` (the constructor rejects both together), so got's built-in 503 retry path is disabled and the error propagated to listStorefront's catch, which answers 500.

**Mechanism.** GET /proxy/tags?domain=brilliante-crystal-cleaner.myshopify.com → tag.controller.listStorefront → cache miss → initShopify(shop) creates `new Shopify({autoLimit: true})` with no maxRetries, so shopify-api-node's constructor default `maxRetries: 0` stands and its graphql() sets `options.retry = 0` (node_modules/shopify-api-node/index.js:337) instead of the retryableStatusCodes list that contains 503 (index.js:24-25). getTagsForStorefront's single `shopify.graphql(getArticleTagsList)` therefore throws got HTTPError 'Response code 503 (Service Unavailable)' on the first attempt (request latency 0.0978s = one attempt, no backoff). In the catch, isShopifyAuthError only matches 401/402/403, so 503 falls through to `ctx.status = 500` and bingbot gets a 500 on a public storefront route.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyService.js:26` — initShopify constructs the client with autoLimit:true and no maxRetries; shopify-api-node throws if both are set, so retries can never be enabled on this client — every Shopify 5xx is fatal on first attempt
- `packages/functions/src/services/tag.service.js:176` — the single unguarded `await shopify.graphql(getArticleTagsList)` that threw the 503
- `packages/functions/src/controllers/tag.controller.js:19` — isShopifyAuthError covers only 401/402/403, so an upstream 503 is not treated as a degradable condition
- `packages/functions/src/controllers/tag.controller.js:98` — ctx.status = 500 — the line that turned a transient upstream 503 into the alerted HTTP 500

## Evidence
- 1 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-02T05:00:00Z" AND timestamp<="2026-08-03T06:00:00Z" AND jsonPayload.tag="[listStorefront]" AND jsonPayload.error.message="Response code 503 (Service Unavailable)"`
- 1 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-02T05:00:00Z" AND timestamp<="2026-08-03T06:00:00Z" AND httpRequest.status>=500 AND httpRequest.requestUrl:"/proxy/tags"`
- 1 matching entries: `timestamp>="2026-08-02T05:00:00Z" AND timestamp<="2026-08-03T06:00:00Z" AND jsonPayload.error.message="Response code 503 (Service Unavailable)"`
- 13 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-02T05:00:00Z" AND timestamp<="2026-08-03T06:00:00Z" AND (jsonPayload.tag="[listStorefront]" OR jsonPayload.tag="[getPostsByTag]")`

## Job
- analyze rounds: 1
- cost: $2.67
- branch: `fix/prod-blog-1q0ihss-a2`
- fix commit: `173b75e91acbf810a9ec499101d25660d4882439`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/820
- tests: 263 tests, 4 failing · baseline 4 failing · reproduce test fails without the fix

```
.../functions/src/controllers/tag.controller.js    | 37 ++++++++++++++++++++++
 packages/functions/src/services/tag.service.js     | 28 ++++++++++++++--
 2 files changed, 62 insertions(+), 3 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
