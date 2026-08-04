fingerprint: 1ib8ldr
service: proxy
message: HTTP 500 GET /proxy/posts-by-tag
app: BLOG
repo: blogs
date: 2026-08-03T14:32:53.030Z
status: mr_open
attempt: 1

# BLOG · proxy · 1ib8ldr

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/828

**Root cause.** Duplicate of fingerprint ha4bhr (MR https://gitlab.com/avada/blogs/-/merge_requests/827 open, unmerged): during a 14:14–14:21Z Shopify Admin GraphQL brownout on ezarc-tools.myshopify.com, Shopify answered HTTP 200 with an in-band `errors` body ("Internal error. Looks like something went wrong on our end. Request ID: …"), shopify-api-node's maybeError hook turned that into a throw, and the storefront tag path has no retry and no transient-error classification, so it fell straight through to ctx.status = 500.

**Mechanism.** All 31 stderr entries carry jsonPayload.error.code ERR_GOT_REQUEST_ERROR, name RequestError, message 'Internal error. Looks like something went wrong on our end.\nRequest ID: <uuid>-<n>', stack `at maybeError (/workspace/node_modules/shopify-api-node/index.js:299:13)` then `at Request.<anonymous> (/workspace/node_modules/got/dist/source/as-promise/index.js:113:42)`. maybeError (node_modules/shopify-api-node/index.js:297-303) throws `new Error(res.body.errors[0].message)` whenever a 200 response body carries an `errors` array — so this is an in-band GraphQL failure, not an HTTP 5xx, and got's status-code retry could never have covered it anyway. Nor is any retry configured: initShopify (packages/functions/src/services/shopifyService.js:23) constructs the client with `autoLimit: true` and no maxRetries (shopifyService.js:30); shopify-api-node forbids that combination (index.js:56) so maxRetries stays 0 (index.js:66) and the graphql request is built with `options.retry = 0` (index.js:337). The throw propagates out of `shopify.graphql(getArticleByTags678, queryParams)` (tag.service.js:246, reached from getPostsByTag → getArticlesByTagWithPagination at tag.controller.js:118) and out of `shopify.graphql(getArticleTagsList)` (tag.service.js:176, reached from listStorefront at tag.controller.js:82). In both catch blocks isShopifyAuthError (tag.controller.js:19) matches only 401/402/403 against `e.statusCode`/`e.response.statusCode` — a RequestError from maybeError has neither field — so the error falls to logger.error + ctx.status = 500 at tag.controller.js:161 (getPostsByTag, the endpoint in the alert) and tag.controller.js:98 (listStorefront). Split: 14 of 31 log lines are '[getPostsByTag] … Error listing posts by tag', 17 are '[listStorefront] … Error listing storefront tags', matching 31 request-log 500s exactly one-to-one. It is per-request, not per-shop: in the same window ezarc-tools also got 18 HTTP 200s (18 of 49 = 37% success), and latencies 0.18–4.49s show immediate upstream rejection, not saturation. Every single 500 in the window belongs to ezarc-tools.myshopify.com, referer www.ezarctools.com, real browser user-agents (iPhone/Android/Windows), i.e. merchant customers seeing a broken tag widget. The burst is confined to 2026-08-03 — zero such entries in the preceding 7 days.

Confidence: `high`

## Code
- `packages/functions/src/controllers/tag.controller.js:161` — ctx.status = 500 on getPostsByTag — the endpoint named in the alert; 14 of the window's 31 failures land here
- `packages/functions/src/controllers/tag.controller.js:19` — isShopifyAuthError matches only 401/402/403 via e.statusCode/e.response.statusCode; a RequestError raised by shopify-api-node's maybeError carries neither, so a transient upstream fault is not classified and falls through to the 500 branch
- `packages/functions/src/controllers/tag.controller.js:98` — ctx.status = 500 on listStorefront — the other 17 failures in the same window, same shop, same cause
- `packages/functions/src/controllers/tag.controller.js:118` — getPostsByTag calls getArticlesByTagWithPagination inside withCache; the throw escapes the cache loader uncaught, so nothing is cached and every retry by the browser re-hits Shopify
- `packages/functions/src/controllers/tag.controller.js:82` — listStorefront calls getTagsForStorefront inside withCache — same uncaught path
- `packages/functions/src/services/tag.service.js:246` — shopify.graphql(getArticleByTags678) in getArticlesByTagWithPagination — the call whose rejection is the RequestError on the /proxy/posts-by-tag path
- `packages/functions/src/services/tag.service.js:176` — shopify.graphql(getArticleTagsList) in getTagsForStorefront — same for /proxy/tags
- `packages/functions/src/services/shopifyService.js:30` — autoLimit: true with no maxRetries — the combination shopify-api-node rejects, so maxRetries stays 0 and got retry is disabled (options.retry = 0) for every Shopify call built here
- `packages/functions/src/services/shopifyService.js:23` — initShopify — the single constructor used by both storefront tag paths

## Evidence
- 31 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-03T13:59:26.051Z" AND timestamp<="2026-08-03T14:29:26.051Z" AND jsonPayload.error.message:"Internal error. Looks like something went wrong on our end."`
- 31 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-03T13:59:26.051Z" AND timestamp<="2026-08-03T14:29:26.051Z" AND httpRequest.status>=500`
- 49 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-03T13:59:26.051Z" AND timestamp<="2026-08-03T14:29:26.051Z" AND httpRequest.requestUrl:"ezarc-tools"`
- 31 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-07-27T00:00:00Z" AND jsonPayload.error.message:"Internal error. Looks like something went wrong on our end."`

## Job
- analyze rounds: 1
- cost: $2.79
- branch: `fix/prod-blog-1ib8ldr`
- fix commit: `56bc0fee81cde4b1d120c35191bdb01ab3050ef3`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/828
- tests: 274 tests, 4 failing · baseline 4 failing · reproduce test fails without the fix

```
.../tag.controller.storefrontErrors.test.js        | 57 ++++++++++++++++++++++
 .../functions/src/controllers/tag.controller.js    | 36 ++++++++++++++
 packages/functions/src/services/tag.service.js     | 23 ++++++++-
 3 files changed, 114 insertions(+), 2 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
