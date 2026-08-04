fingerprint: qftd5e
service: proxy
message: [getPostsByTag] <http://ezarc-tools.myshopify.com|ezarc-tools.myshopify.com> tag:  Error listing posts by tag RequestError: Internal error. Looks like something went wrong on our end.
app: BLOG
repo: blogs
date: 2026-08-03T14:24:42.801Z
status: mr_open
attempt: 1

# BLOG · proxy · qftd5e

**Outcome.** duplicate of ha4bhr — MR https://gitlab.com/avada/blogs/-/merge_requests/827

**Root cause.** Duplicate of fingerprint ha4bhr (MR https://gitlab.com/avada/blogs/-/merge_requests/827 open, unmerged): Shopify's Admin GraphQL kept answering ezarc-tools.myshopify.com with an in-band GraphQL error body ("Internal error. Looks like something went wrong on our end. Request ID: …"), and the two storefront tag endpoints have no retry and no non-auth degradation path, so every one of those upstream errors became an HTTP 500 on a public /proxy route.

**Mechanism.** shopify-api-node's graphql() installs maybeError as a got afterResponse hook: when an HTTP-200 response body carries an `errors` array it does `throw new Error(res.body.errors[0].message)` (node_modules/shopify-api-node/index.js:299), which got re-wraps as a RequestError with code ERR_GOT_REQUEST_ERROR — exactly the stack in the alert (as-promise/index.js:113 → maybeError index.js:299 → as-promise index.js:87), confirmed by jsonPayload.error.code="ERR_GOT_REQUEST_ERROR" on all 31 stderr entries. That wrapped plain Error carries no statusCode and no response object. The 31 500s in the window split 17 GET /proxy/tags (domain=ezarc-tools.myshopify.com&limit=20&orderBy=updatedAt desc) → tag.controller.listStorefront → cache miss → getTagsForStorefront's single unguarded `shopify.graphql(getArticleTagsList)` (tag.service.js:176), and 14 GET /proxy/posts-by-tag (…&limit=6&search=) → getPostsByTag, whose empty search is passed as tag:'' so tag-resolution is skipped and `shopify.graphql(getArticleByTags678, queryParams)` (tag.service.js:246) throws — matching the alert text '[getPostsByTag] … tag:  '. In both catches isShopifyAuthError (tag.controller.js:19) tests `e?.statusCode ?? e?.response?.statusCode` against [401,402,403]; both are undefined on a maybeError-wrapped RequestError, so control falls through to ctx.status = 500 (tag.controller.js:98 and :161). initShopify builds the client with autoLimit:true (shopifyService.js:30), which forces shopify-api-node maxRetries:0, so no client-level retry exists — and got would not have retried anyway, since the failure is a hook throw on an accepted 200 response, not a status code. Latency 0.18–4.49s confirms upstream round-trips, not saturation. Note open MR 820 adds withShopifyRetry to these same two calls but its predicate matches only statusCode ∈ [429,500,502,503,504] or code ∈ [ETIMEDOUT,ECONNRESET], so it does not cover an ERR_GOT_REQUEST_ERROR with no statusCode; MR 827 (branch fix/prod-blog-ha4bhr) is the one that does.

Confidence: `high`

## Code
- `packages/functions/src/services/tag.service.js:176` — getTagsForStorefront's single unguarded shopify.graphql(getArticleTagsList) — the call that threw for the 17 [listStorefront] failures
- `packages/functions/src/services/tag.service.js:246` — getArticlesByTagWithPagination's shopify.graphql(getArticleByTags678) — the call reached with tag='' for the 14 [getPostsByTag] failures
- `packages/functions/src/controllers/tag.controller.js:19` — isShopifyAuthError classifies only by statusCode/response.statusCode, both undefined on a maybeError-wrapped RequestError
- `packages/functions/src/controllers/tag.controller.js:108` — getPostsByTag reads search='' from the query and forwards it as the tag, so the tag-resolution branch is skipped
- `packages/functions/src/controllers/tag.controller.js:98` — listStorefront turns the unclassified upstream error into an HTTP 500
- `packages/functions/src/controllers/tag.controller.js:161` — getPostsByTag does the same for /proxy/posts-by-tag — the endpoint named in this alert
- `packages/functions/src/services/shopifyService.js:30` — initShopify sets autoLimit:true, which forces shopify-api-node maxRetries:0 — no client-level retry on this path

## Evidence
- 31 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-03T13:59:26Z" AND timestamp<="2026-08-03T14:29:26Z" AND jsonPayload.error.code="ERR_GOT_REQUEST_ERROR"`
- 31 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-03T13:59:26Z" AND timestamp<="2026-08-03T14:29:26Z" AND httpRequest.status>=500`
- 31 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-03T13:00:00Z" AND timestamp<="2026-08-03T15:00:00Z" AND jsonPayload.error.message:"Internal error. Looks like something went wrong on our end."`
- 14 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-03T13:00:00Z" AND timestamp<="2026-08-03T15:00:00Z" AND jsonPayload.tag="[getPostsByTag]"`

## Job
- analyze rounds: 1
- cost: $0.73
- MR: https://gitlab.com/avada/blogs/-/merge_requests/827

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
