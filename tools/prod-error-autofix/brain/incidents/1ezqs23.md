fingerprint: 1ezqs23
service: proxy
message: [listStorefront] <http://85725a.myshopify.com|85725a.myshopify.com> Error listing storefront tags HTTPError: Response code 423 (Locked)
app: BLOG
repo: blogs
date: 2026-09-13T12:24:55.282Z
status: fix_disabled
attempt: 1

# BLOG · proxy · 1ezqs23

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Shop 85725a.myshopify.com is locked in Shopify (Admin API answers HTTP 423 Locked), and tag.controller.js's isShopifyAuthError guard only treats 401/402/403 as "shop no longer connected", so the 423 falls through to the generic catch and both storefront proxy routes answer 500 instead of an empty result.

**Mechanism.** Both /proxy/tags and /proxy/posts-by-tag load the shop doc by domain and build a shopify-api-node client, then issue an Admin GraphQL POST via got: listStorefront -> getTagsForStorefront -> shopify.graphql(getArticleTagsList) (tag.service.js:176), and getPostsByTag -> getArticlesByTagWithPagination -> shopify.graphql(getArticleByTags678) (tag.service.js:246). Shopify answers 423 Locked for this shop, so got throws HTTPError ERR_NON_2XX_3XX_RESPONSE with statusCode 423 — exactly the stack in the logs (got as-promise/index.js:118). In each controller catch the predicate at tag.controller.js:19 tests [401,402,403].includes(423) => false, so the warn/empty-body branch at tag.controller.js:90 and tag.controller.js:131 is skipped and control reaches logger.error + ctx.status = 500 at tag.controller.js:96 (and the matching getPostsByTag branch), producing the alerted ERROR and the 500s.

Confidence: `high`

## Code
- `packages/functions/src/controllers/tag.controller.js:19` — isShopifyAuthError only accepts 401/402/403 — 423 Locked is not in the list, which is the whole defect
- `packages/functions/src/controllers/tag.controller.js:90` — listStorefront's graceful branch that the 423 fails to enter
- `packages/functions/src/controllers/tag.controller.js:96` — the logger.error that emitted the alerted line, followed by ctx.status = 500
- `packages/functions/src/controllers/tag.controller.js:131` — same guard in getPostsByTag, explaining the paired /proxy/posts-by-tag 500s in the same window
- `packages/functions/src/services/tag.service.js:176` — shopify.graphql(getArticleTagsList) in getTagsForStorefront — the got call that throws the 423 for /proxy/tags
- `packages/functions/src/services/tag.service.js:246` — shopify.graphql(getArticleByTags678) in getArticlesByTagWithPagination — the got call that throws the 423 for /proxy/posts-by-tag

## Evidence
- 4 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-09-13T12:05:49Z" AND timestamp<="2026-09-13T12:35:49Z" AND jsonPayload.error.message="Response code 423 (Locked)"`
- 4 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-09-13T12:05:49Z" AND timestamp<="2026-09-13T12:35:49Z" AND httpRequest.status=500`

## Job
- analyze rounds: 2
- cost: $2.63

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
