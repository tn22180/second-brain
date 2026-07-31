fingerprint: 1q0ihss
service: proxy
message: HTTP 500 GET /proxy/tags
app: BLOG
repo: blogs
date: 2026-07-31T07:06:24.239Z
status: deferred
attempt: 1

# BLOG · proxy · 1q0ihss

**Outcome.** MR deferred by mr_per_repo_per_day

**Root cause.** Shops whose Shopify install is dead (uninstalled, deactivated or frozen) keep their Firestore shop doc with a now-revoked accessToken, so crawler/browser traffic on /proxy/tags and /proxy/posts-by-tag builds a Shopify client from that dead token, Admin GraphQL answers 401, and both controllers' catch blocks convert it to HTTP 500.

**Mechanism.** All 8 request entries in the alert window are 500s on /proxy/tags + /proxy/posts-by-tag for two domains only: 2c8a5e-75.myshopify.com (4, at 06:54:37) and 1f790c-c4.myshopify.com (4, at 06:47:17-18, referer https://teslary.nl/, AhrefsBot). Latencies 0.086-0.561s — immediate failure, not saturation. All 8 stderr entries are the same object: {code: ERR_NON_2XX_3XX_RESPONSE, message: 'Response code 401 (Unauthorized)', stack: /workspace/node_modules/got/dist/source/as-promise/index.js:118:42} — got rejecting a Shopify Admin call, one per failed request plus its retry. Chain: getShopByField(domain) returns the surviving shop doc, so the `if (!shop)` guards at tag.controller.js:75 and :104 do not fire; initShopify (tag.controller.js:76, :107 -> shopifyService.js:23) reads accessToken through prepareShopData with no validity check; tag.service.js:176 (getTagsForStorefront) and tag.service.js:246 (getArticlesByTagWithPagination) issue shopify.graphql; Shopify answers 401; the catches at tag.controller.js:86 and :122 log the literal strings '[listStorefront] 2c8a5e-75.myshopify.com Error listing storefront tags' and '[getPostsByTag] 2c8a5e-75.myshopify.com tag:  Error listing posts by tag' at severity ERROR, then set ctx.status = 500 at :88 and :131 — that is the httpRequest.status 500 that fired the alert. 1f790c-c4 is a confirmed uninstall ('Handling uninstalling for' 2026-07-29T16:41:46Z); uninstallApp (uninstallationService.js:27) returns early when accessToken is missing and never clears the token nor marks the doc uninstalled, so dead docs persist. Over 24h: 90 401 log lines in proxy exactly match 90 /proxy/tags(40) + /proxy/posts-by-tag(50) 500s; the remaining 12 proxy 500s are /proxy/seo on glacierfrostco.myshopify.com, a different cause. shopCacheService.withCache caches only success, so every crawler hit repeats the round trip. Same cause as fingerprints 12qs3xc and 1ib8ldr (MR 799 open); this alert is its /proxy/tags symptom on two more shops.

Confidence: `high`

## Code
- `packages/functions/src/controllers/tag.controller.js:76` — listStorefront builds a Shopify client from the surviving shop doc; only guard is `if (!shop) return []` at :75 — no token-validity check
- `packages/functions/src/controllers/tag.controller.js:86` — catch logs '[listStorefront] <domain> Error listing storefront tags' at severity ERROR — exact string in the alert's stderr entries
- `packages/functions/src/controllers/tag.controller.js:88` — ctx.status = 500 for a revoked-token 401 — produces the httpRequest.status 500 on GET /proxy/tags that fired the alert
- `packages/functions/src/controllers/tag.controller.js:107` — getPostsByTag has the identical initShopify path — second symptom, same cause, 50 of the 90 24h failures
- `packages/functions/src/controllers/tag.controller.js:122` — catch logs '[getPostsByTag] <domain> tag: ... Error listing posts by tag', literal message in the window
- `packages/functions/src/services/shopifyService.js:23` — initShopify reads accessToken via prepareShopData with no validity check; a revoked token yields a client that 401s on first call
- `packages/functions/src/services/tag.service.js:176` — shopify.graphql(getArticleTagsList) in getTagsForStorefront — the call whose got rejection is the HTTPError in the stack
- `packages/functions/src/services/tag.service.js:246` — shopify.graphql(getArticleByTags678) in getArticlesByTagWithPagination — same for the posts-by-tag symptom
- `packages/functions/src/services/uninstallationService.js:27` — uninstallApp returns early on missing accessToken, never clears it nor marks the shop uninstalled, so dead tokens survive indefinitely

## Evidence
- 90 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-07-30T07:02:29Z" AND timestamp<="2026-07-31T07:02:29Z" AND jsonPayload.message:"401 (Unauthorized)"`
- 102 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-07-30T07:02:29Z" AND timestamp<="2026-07-31T07:02:29Z" AND httpRequest.status>=500`
- 8 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-07-31T06:32:29Z" AND timestamp<="2026-07-31T07:02:29Z" AND jsonPayload.error.code="ERR_NON_2XX_3XX_RESPONSE"`
- 2 matching entries: `timestamp>="2026-06-01T00:00:00Z" AND textPayload:"Handling uninstalling for" AND (textPayload:"kzzi-2" OR textPayload:"1f790c-c4")`

## Job
- analyze rounds: 1
- cost: $0.79

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
