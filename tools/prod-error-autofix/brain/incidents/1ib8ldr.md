fingerprint: 1ib8ldr
service: proxy
message: HTTP 500 GET /proxy/posts-by-tag
app: BLOG
repo: blogs
date: 2026-07-31T07:00:51.221Z
status: deferred
attempt: 1

# BLOG · proxy · 1ib8ldr

**Outcome.** MR deferred by mr_per_repo_per_day

**Root cause.** Shops whose install is gone (uninstalled or store deactivated) keep their Firestore shop doc with a now-revoked accessToken, so crawler hits on /proxy/tags and /proxy/posts-by-tag build a Shopify client from that dead token, Shopify Admin answers 401, got throws HTTPError, and both controllers' catch blocks turn it into HTTP 500.

**Mechanism.** 1f790c-c4.myshopify.com uninstalled at 2026-07-29T16:41:46.289076Z ('Handling uninstalling for  1f790c-c4.myshopify.com', service auth). uninstallApp (packages/functions/src/services/uninstallationService.js:16) returns early at :27-29 when it wants an accessToken and never clears the token nor writes an uninstalled flag, so the shop doc survives with a revoked token. Theme still ships the app block, so crawlers (AhrefsBot/7.0 on 1f790c-c4, a Firefox-152 UA on 2c8a5e-75) keep firing /proxy/tags and /proxy/posts-by-tag. getShopByField returns the surviving doc, so the `if (!shop)` guards at tag.controller.js:75 and :104-106 are bypassed; initShopify (tag.controller.js:76 and :107 → shopifyService.js:23) constructs a Shopify client from the dead token; getTagsForStorefront issues shopify.graphql(getArticleTagsList) at tag.service.js:176 and getArticlesByTagWithPagination at tag.service.js:246; Shopify answers 401; shopify-api-node's got rejects with HTTPError ERR_NON_2XX_3XX_RESPONSE (stack /workspace/node_modules/got/dist/source/as-promise/index.js:118:42, verbatim in all 8 stderr entries in the window); the catches log at severity ERROR (tag.controller.js:86 and :122) and set ctx.status = 500 at :88 and :131. Latencies 0.086-0.561s — immediate failure, not saturation. shopCacheService.withCache only caches a returned value, so a throw is never cached and every crawler hit repeats the round trip: 32 401 log lines across 4 domains today (1f790c-c4 20, kzzi-2 4, 7e7d24-a8 4, 2c8a5e-75 4).

Confidence: `high`

## Code
- `packages/functions/src/controllers/tag.controller.js:107` — getPostsByTag — the endpoint in the alert — calls initShopify on the surviving shop doc; only guard is `if (!shop)` at :104, nothing checks token validity
- `packages/functions/src/controllers/tag.controller.js:122` — catch logs '[getPostsByTag] <domain> tag:  Error listing posts by tag' — the literal message in the window's stderr/errors entries
- `packages/functions/src/controllers/tag.controller.js:131` — ctx.status = 500 for a revoked-token 401 — this is what produced httpRequest.status 500 that paged
- `packages/functions/src/controllers/tag.controller.js:76` — listStorefront has the identical initShopify path; its 500s interleave with posts-by-tag one-for-one in the request log
- `packages/functions/src/controllers/tag.controller.js:86` — catch logs '[listStorefront] <domain> Error listing storefront tags' — second message family in the window
- `packages/functions/src/controllers/tag.controller.js:88` — ctx.status = 500 on the listStorefront path
- `packages/functions/src/services/shopifyService.js:23` — initShopify reads accessToken via prepareShopData with no validity check; a revoked token yields a client that 401s on its first call
- `packages/functions/src/services/tag.service.js:176` — shopify.graphql(getArticleTagsList) in getTagsForStorefront — the call whose got rejection is the HTTPError in the stack
- `packages/functions/src/services/tag.service.js:246` — shopify.graphql(getArticleByTags678) in getArticlesByTagWithPagination — same for the posts-by-tag path
- `packages/functions/src/services/uninstallationService.js:27` — uninstallApp returns early on a missing accessToken and never clears it nor marks the shop uninstalled, so the dead token survives indefinitely — 1f790c-c4 still 401s 38h after its uninstall webhook

## Evidence
- 32 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-07-31T00:00:00Z" AND jsonPayload.message:"401 (Unauthorized)"`
- 8 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-07-31T06:32:29.627Z" AND timestamp<="2026-07-31T07:02:29.627Z" AND httpRequest.status>=500`
- 1 matching entries: `timestamp>="2026-06-01T00:00:00Z" AND (textPayload:"Handling uninstalling for" OR jsonPayload.message:"Handling uninstalling for") AND (textPayload:("2c8a5e-75" OR "1f790c-c4") OR jsonPayload.message:("2c8a5e-75" OR "1f790c-c4"))`

## Job
- analyze rounds: 1
- cost: $0.72

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
