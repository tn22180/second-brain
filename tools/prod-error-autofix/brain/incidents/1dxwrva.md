fingerprint: 1dxwrva
service: proxy
message: [getPostsByTag] <http://c1ax1n-pj.myshopify.com|c1ax1n-pj.myshopify.com> tag:  Error listing posts by tag RequestError: Access denied for articles field. Shop is under review.
app: BLOG
repo: blogs
date: 2026-09-14T07:08:48.679Z
status: fix_disabled
attempt: 1

# BLOG · proxy · 1dxwrva

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Duplicate of recorded fingerprint 1lzrsah (same 07:02:27–28Z burst, same shop, same 4 log lines): Shopify has placed c1ax1n-pj.myshopify.com 'under review' and its Admin GraphQL answers the `articles` query in getArticlesByTagWithPagination with a GraphQL-level ACCESS_DENIED error on HTTP 200, which tag.controller.js's isShopifyAuthError guard (401/402/403 only) does not recognise, so getPostsByTag falls through to logger.error + ctx.status = 500 on a shop-state condition, not a code defect.

**Mechanism.** Bingbot (UA bingbot/2.0, 4 Google-proxied IPs) rendered the shop's storefront at 07:02:27Z and fired 4 App Proxy calls in 0.75s: 2× GET /proxy/posts-by-tag?domain=c1ax1n-pj.myshopify.com&limit=6&search= and 2× GET /proxy/tags?domain=c1ax1n-pj.myshopify.com. getPostsByTag builds a shopify-api-node client from the stored token and calls shopify.graphql(getArticleByTags678) at tag.service.js:246; Shopify answers 200 with an `errors` entry 'Access denied for articles field. Shop is under review.'. shopify-api-node's afterResponse hook maybeError (stack frame shopify-api-node/index.js:299) throws on that body; got wraps it as RequestError code ERR_GOT_REQUEST_ERROR (visible in jsonPayload.error.code) — no `statusCode`, response.statusCode 200. isShopifyAuthError(e) at tag.controller.js:19 is therefore false, the warn/empty branch at :131 is skipped, logger.error at :152 emits the alerted '[getPostsByTag] c1ax1n-pj.myshopify.com tag:  Error listing posts by tag RequestError: Access denied for articles field. Shop is under review.' line, and :161 sets 500. 4 of 4 application error lines and 4 of 4 5xx request lines in the window are this shop and this message (2 getPostsByTag, 2 listStorefront); latency 0.13–0.34s = immediate rejection, no saturation. Re-run against GCP: the 4 lines at 07:02:27.748Z/.924Z/.990Z/28.155Z are the only 'Shop is under review' entries in avada-blog-app since 2026-09-01 — one shop, one crawler pass. The listStorefront half of the same burst was already triaged as 1lzrsah (fix_disabled); this fingerprint differs only in the log tag. Same defect family as 423-Locked proxy incidents 1trpn4m/1ezqs23: the 'shop not serviceable' classifier enumerates HTTP statuses and misses Shopify's in-band GraphQL rejections.

Confidence: `high`

## Code
- `packages/functions/src/controllers/tag.controller.js:19` — isShopifyAuthError only matches e.statusCode / e.response.statusCode in [401,402,403]; a GraphQL ACCESS_DENIED arrives as got RequestError (ERR_GOT_REQUEST_ERROR) with no statusCode and HTTP 200, so it is not classified as 'shop not connected'
- `packages/functions/src/controllers/tag.controller.js:131` — getPostsByTag's guard evaluates false for the under-review error, skipping the empty-data warn branch
- `packages/functions/src/controllers/tag.controller.js:152` — logger.error that produced the alerted '[getPostsByTag] … Access denied for articles field. Shop is under review.' line
- `packages/functions/src/controllers/tag.controller.js:161` — ctx.status = 500 — the 2× GET /proxy/posts-by-tag 500s in the request log
- `packages/functions/src/controllers/tag.controller.js:90` — listStorefront's identical guard — the other 2 lines in the same burst, already recorded as 1lzrsah
- `packages/functions/src/services/tag.service.js:246` — shopify.graphql(getArticleByTags678) — the `articles` query Shopify denied for the under-review shop
- `packages/functions/src/services/tag.service.js:176` — shopify.graphql(getArticleTagsList) — the `articleTags` query denied in the listStorefront half of the burst

## Evidence
- 4 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-09-14T06:47:42.509Z" AND timestamp<="2026-09-14T07:17:42.509Z" AND jsonPayload.error.message:"Shop is under review"`
- 4 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-09-14T06:47:42.509Z" AND timestamp<="2026-09-14T07:17:42.509Z" AND httpRequest.status>=500 AND httpRequest.requestUrl:"c1ax1n-pj.myshopify.com"`
- 4 matching entries: `timestamp>="2026-09-01T00:00:00Z" AND jsonPayload.error.message:"Shop is under review"`

## Job
- analyze rounds: 1
- cost: $1.51

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
