fingerprint: 1lzrsah
service: proxy
message: [listStorefront] <http://c1ax1n-pj.myshopify.com|c1ax1n-pj.myshopify.com> Error listing storefront tags RequestError: Access denied for articleTags field. Shop is under review.
app: BLOG
repo: blogs
date: 2026-09-14T07:07:06.564Z
status: fix_disabled
attempt: 1

# BLOG · proxy · 1lzrsah

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Shopify has placed shop c1ax1n-pj.myshopify.com 'under review' and its Admin GraphQL answers every articleTags/articles query with an ACCESS_DENIED GraphQL error ('Access denied for articleTags field. Shop is under review.') on an HTTP 200, which tag.controller.js's isShopifyAuthError guard (401/402/403 only) does not recognise, so listStorefront and getPostsByTag fall through to the 500 branch and page on a shop-state condition that is not a defect.

**Mechanism.** Bingbot rendered the shop's storefront at 07:02:27Z, firing 4 App Proxy calls in 0.7s (2× GET /proxy/tags, 2× GET /proxy/posts-by-tag, all domain=c1ax1n-pj.myshopify.com). Each handler builds a shopify-api-node client from the stored token and calls shopify.graphql(getArticleTagsList) / shopify.graphql(getArticleByTags678). Shopify answers with a GraphQL-level `errors` entry 'Access denied for <field> field. Shop is under review.'; shopify-api-node's afterResponse hook maybeError throws on that body and got wraps it as RequestError (code ERR_GOT_REQUEST_ERROR — the wrapped-hook code, not HTTPError's ERR_NON_2XX_3XX_RESPONSE). That error has no `statusCode` and its non-enumerable `response.statusCode` is 200, so `isShopifyAuthError(e)` at tag.controller.js:19 is false; had it been 401/402/403 the warn branch at :90/:131 would have swallowed it. Both catches therefore hit logger.error (:96, :152) and ctx.status = 500 (:98, :161). 4 of 4 application error lines and 4 of 4 5xx request lines in the window are this one shop and this one message; latency 0.13–0.34s (immediate rejection, no saturation). First occurrence of 'Shop is under review' anywhere in avada-blog-app since 2026-08-15 — same defect family as the recorded 423-Locked proxy incidents 1trpn4m/1ezqs23: the 'shop not serviceable' classifier enumerates HTTP statuses and misses Shopify's non-4xx rejections.

Confidence: `high`

## Code
- `packages/functions/src/controllers/tag.controller.js:19` — isShopifyAuthError only matches e.statusCode / e.response.statusCode in [401,402,403]; a GraphQL ACCESS_DENIED arrives as got RequestError with no statusCode and HTTP 200, so it is not classified as 'shop not connected'
- `packages/functions/src/controllers/tag.controller.js:90` — listStorefront's guard evaluates false for the under-review error, skipping the empty-data warn branch
- `packages/functions/src/controllers/tag.controller.js:96` — logger.error line that produced the alerted '[listStorefront] … Error listing storefront tags RequestError: Access denied for articleTags field. Shop is under review.'
- `packages/functions/src/controllers/tag.controller.js:98` — ctx.status = 500 — the 2× GET /proxy/tags 500s in the request log
- `packages/functions/src/controllers/tag.controller.js:131` — getPostsByTag's identical guard, also false for this error
- `packages/functions/src/controllers/tag.controller.js:152` — logger.error that produced the '[getPostsByTag] … Access denied for articles field. Shop is under review.' lines
- `packages/functions/src/controllers/tag.controller.js:161` — ctx.status = 500 — the 2× GET /proxy/posts-by-tag 500s
- `packages/functions/src/services/tag.service.js:176` — shopify.graphql(getArticleTagsList) — the articleTags query Shopify denied for the under-review shop
- `packages/functions/src/services/tag.service.js:246` — shopify.graphql(getArticleByTags678) — the articles query Shopify denied for the under-review shop

## Evidence
- 4 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-09-14T06:47:42.458Z" AND timestamp<="2026-09-14T07:17:42.458Z" AND jsonPayload.error.message:"Shop is under review"`
- 4 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-09-14T06:47:42.458Z" AND timestamp<="2026-09-14T07:17:42.458Z" AND httpRequest.status>=500 AND httpRequest.requestUrl:"c1ax1n-pj.myshopify.com"`
- 4 matching entries: `timestamp>="2026-08-15T00:00:00Z" AND jsonPayload.error.message:"Shop is under review"`

## Job
- analyze rounds: 1
- cost: $2.39

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
