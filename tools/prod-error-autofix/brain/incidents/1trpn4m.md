fingerprint: 1trpn4m
service: proxy
message: [getPostsByTag] <http://85725a.myshopify.com|85725a.myshopify.com> tag:  Error listing posts by tag HTTPError: Response code 423 (Locked)
app: BLOG
repo: blogs
date: 2026-09-13T12:26:14.107Z
status: fix_disabled
attempt: 1

# BLOG · proxy · 1trpn4m

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Shop 85725a.myshopify.com is locked in Shopify (Admin API answers HTTP 423 Locked) and tag.controller.js's isShopifyAuthError guard only accepts 401/402/403, so the 423 skips the graceful empty-result branch and both storefront proxy routes answer 500.

**Mechanism.** A visitor on koreanmealkit.com (custom domain of 85725a.myshopify.com) loads the tag widget, which fires GET /proxy/tags and GET /proxy/posts-by-tag. Each controller resolves the shop doc by domain (so the `if (!shop)` guard at tag.controller.js:80 / :114 is bypassed), builds a shopify-api-node client via initShopify, and issues an Admin GraphQL POST through got: listStorefront -> getTagsForStorefront -> shopify.graphql(getArticleTagsList) at tag.service.js:176, and getPostsByTag -> getArticlesByTagWithPagination -> shopify.graphql(getArticleByTags678, queryParams) at tag.service.js:246. Shopify answers 423 Locked, got rejects with HTTPError code ERR_NON_2XX_3XX_RESPONSE at got/dist/source/as-promise/index.js:118 — the exact stack in all 4 error entries. In each catch the predicate at tag.controller.js:19 evaluates [401,402,403].includes(423) === false, so the warn + empty-body branch at tag.controller.js:90 / :131 is skipped and control falls to logger.error + ctx.status = 500 at tag.controller.js:96/:98 and :152/:161. That produces the alerted ERROR lines and the paired 500s at 0.11-0.37s latency (fast, no retry, no saturation).

Confidence: `high`

## Code
- `packages/functions/src/controllers/tag.controller.js:19` — isShopifyAuthError only accepts 401/402/403; 423 Locked is not in the list — the whole defect
- `packages/functions/src/controllers/tag.controller.js:90` — listStorefront's graceful empty-data branch the 423 fails to enter
- `packages/functions/src/controllers/tag.controller.js:96` — logger.error that emitted '[listStorefront] 85725a.myshopify.com Error listing storefront tags'
- `packages/functions/src/controllers/tag.controller.js:98` — ctx.status = 500 — the /proxy/tags 500s in the requests read
- `packages/functions/src/controllers/tag.controller.js:131` — same guard in getPostsByTag, the second symptom of the one cause
- `packages/functions/src/controllers/tag.controller.js:152` — logger.error that emitted the alerted '[getPostsByTag] ... Error listing posts by tag' line
- `packages/functions/src/controllers/tag.controller.js:161` — ctx.status = 500 — the /proxy/posts-by-tag 500s
- `packages/functions/src/services/tag.service.js:176` — shopify.graphql(getArticleTagsList) — the got call that throws the 423 for /proxy/tags
- `packages/functions/src/services/tag.service.js:246` — shopify.graphql(getArticleByTags678, queryParams) — the got call that throws the 423 for /proxy/posts-by-tag

## Evidence
- 4 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-09-13T12:05:49Z" AND timestamp<="2026-09-13T12:35:49Z" AND jsonPayload.error.message="Response code 423 (Locked)"`
- 4 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-09-13T12:05:49Z" AND timestamp<="2026-09-13T12:35:49Z" AND httpRequest.status=500`
- 2 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-09-13T12:05:49Z" AND timestamp<="2026-09-13T12:35:49Z" AND jsonPayload.tag="[listStorefront]"`

## Job
- analyze rounds: 1
- cost: $1.36

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
