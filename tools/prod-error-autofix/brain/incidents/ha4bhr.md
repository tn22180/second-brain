fingerprint: ha4bhr
service: proxy
message: [listStorefront] <http://ezarc-tools.myshopify.com|ezarc-tools.myshopify.com> Error listing storefront tags RequestError: Internal error. Looks like something went wrong on our end.
app: BLOG
repo: blogs
date: 2026-08-03T14:23:15.372Z
status: mr_open
attempt: 1

# BLOG · proxy · ha4bhr

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/827

**Root cause.** Shopify's Admin GraphQL answered ezarc-tools.myshopify.com with an in-band GraphQL error body ("Internal error. Looks like something went wrong on our end. Request ID: …") for 2m16s, and the storefront tag endpoints have no retry and no non-auth degradation path, so every one of those 28 upstream errors became an HTTP 500 on a public /proxy route.

**Mechanism.** shopify-api-node's graphql() installs maybeError as a got afterResponse hook: when the response body carries an `errors` array it does `throw new Error(res.body.errors[0].message)` (node_modules/shopify-api-node/index.js:299), which got re-wraps as a RequestError with code ERR_GOT_REQUEST_ERROR — exactly the stack in the alert (as-promise/index.js:113 → maybeError index.js:299 → as-promise index.js:87). That wrapped plain Error carries no statusCode and no response object. GET /proxy/tags → tag.controller.listStorefront → cache miss → getTagsForStorefront's single unguarded `shopify.graphql(getArticleTagsList)` (tag.service.js:176) throws it; GET /proxy/posts-by-tag with search='' skips the tag-resolution call and throws on `shopify.graphql(getArticleByTags678)` (tag.service.js:246) — the log line '[getPostsByTag] … tag:  ' confirms the empty tag. In both catches isShopifyAuthError (tag.controller.js:19) tests `e?.statusCode ?? e?.response?.statusCode` against [401,402,403]; both are undefined here, so control falls to ctx.status = 500 (tag.controller.js:98 and :161). initShopify builds the client with autoLimit:true (shopifyService.js:30), which forces shopify-api-node's maxRetries:0, so got's own retry is off — but got would not have retried this anyway, because the failure is a hook throw on an accepted response, not a status code. Note the open, unmerged MR 820 (branch fix/prod-blog-1q0ihss-a2) adds withShopifyRetry to exactly these two calls, but its predicate matches only statusCode ∈ [429,500,502,503,504] or code ∈ [ETIMEDOUT,ECONNRESET] — it would not retry an ERR_GOT_REQUEST_ERROR with no statusCode, so that MR does not cover this alert.

Confidence: `high`

## Code
- `packages/functions/src/services/tag.service.js:176` — getTagsForStorefront's single unguarded shopify.graphql(getArticleTagsList) — the call that threw for the 14 [listStorefront] failures
- `packages/functions/src/services/tag.service.js:246` — getArticlesByTagWithPagination's shopify.graphql(getArticleByTags678) — the call reached with tag='' for the 14 [getPostsByTag] failures
- `packages/functions/src/controllers/tag.controller.js:19` — isShopifyAuthError classifies only by statusCode/response.statusCode, both undefined on a maybeError-wrapped RequestError
- `packages/functions/src/controllers/tag.controller.js:98` — listStorefront turns the unclassified upstream error into the alerted HTTP 500
- `packages/functions/src/controllers/tag.controller.js:161` — getPostsByTag does the same for /proxy/posts-by-tag
- `packages/functions/src/services/shopifyService.js:30` — initShopify sets autoLimit:true, which forces shopify-api-node maxRetries:0 — no client-level retry exists on this path

## Evidence
- 28 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-03T13:00:00Z" AND timestamp<="2026-08-03T15:00:00Z" AND jsonPayload.error.code="ERR_GOT_REQUEST_ERROR"`
- 28 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-03T13:00:00Z" AND timestamp<="2026-08-03T15:00:00Z" AND httpRequest.status>=500`
- 28 matching entries: `timestamp>="2026-08-03T00:00:00Z" AND timestamp<="2026-08-03T15:00:00Z" AND jsonPayload.error.message:"Internal error. Looks like something went wrong on our end."`
- 28 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-03T00:00:00Z" AND timestamp<="2026-08-03T15:00:00Z" AND jsonPayload.error.code="ERR_GOT_REQUEST_ERROR"`

## Job
- analyze rounds: 1
- cost: $3.25
- branch: `fix/prod-blog-ha4bhr`
- fix commit: `196f2c9c388d634cc42aa7d2dee3693524b508c5`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/827
- tests: 276 tests, 4 failing · baseline 4 failing · reproduce test fails without the fix

```
.../tag.controller.storefrontErrors.test.js        | 40 +++++++++++++++++++++-
 .../functions/src/controllers/tag.controller.js    | 33 +++++++++++++++++-
 packages/functions/src/services/tag.service.js     | 25 ++++++++++++--
 3 files changed, 94 insertions(+), 4 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
