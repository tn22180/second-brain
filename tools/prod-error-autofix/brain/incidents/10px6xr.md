fingerprint: 10px6xr
service: proxy
message: [getPreview] CRITICAL: article left PUBLISHED after preview, manual unpublish required <http://full-of-yoga-2.myshopify.com|full-of-yoga-2.myshopify.com> articleId=[CARD]
app: BLOG
repo: blogs
date: 2026-10-09T10:41:05.565Z
status: fix_disabled
attempt: 1

# BLOG · proxy · 10px6xr

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** The 4th fingerprint of one single cascade: a present-but-non-numeric `id` (literal `[CARD]`) on GET /proxy/seoOn-preview is swallowed by getShopifyArticleById's catch, which returns `{}` instead of rethrowing InvalidArticleIdError, so getPreview publishes a bogus gid, 500s on the `{}` stub, and then fails 3 revert retries and emits a FALSE 'article left PUBLISHED, manual unpublish required' CRITICAL — nothing was ever published.

**Mechanism.** Two GETs — 10:27:12.870398Z and 10:27:16.380172Z, latency 3.153s / 3.137s — to /proxy/seoOn-preview?...id=%5BCARD%5D&shop=full-of-yoga-2.myshopify.com. Cloud Run's own httpRequest.requestUrl carries `id=%5BCARD%5D`, so the client really sent the unsubstituted placeholder; nothing app-side rewrote it. (1) appProxyController.js:113 only tests `!id`, so the present-but-invalid value passes. (2) The call at :124 reaches getShopifyArticleById; normalizeShopifyGid output fails the regex `/^(\d+|gid:\/\/shopify\/Article\/\d+)$/` at shopifyGraphQlService.js:759 and :760 throws InvalidArticleIdError — logged at :890 (10:27:13.164643Z, 10:27:16.612724Z, exactly the stack family in the sibling alerts) — but the catch at :891 does `return {}`. (3) Back in getPreview, `article.isPublished` at :129 is undefined → falsy, so control falls to the publish at :136. toArticleGid (shopifyGraphQlService.js:1098) concatenates with no digit check, sending `gid://shopify/Article/[CARD]`; Shopify answers INVALID_VARIABLE 'Invalid global id', logged at :1253 and **returned** at :1254 as `{userErrors}` rather than thrown, so updateShopifyArticle's rethrow at :1193 never fires and appProxyController.js:137 sets didPublishForPreview = true for a publish that failed (10:27:13.386902Z, 10:27:16.832856Z). (4) :143 reads `article.blog.handle` off the `{}` stub → TypeError "Cannot read properties of undefined (reading 'handle')" (10:27:13.387336Z, 10:27:16.833238Z), caught at :171 → ctx.status = 500 at :172. (5) The `finally` at :178 trusts the bogus flag and runs revertArticleToDraft; each of its 3 attempts calls updateShopifyArticle at :30, gets `{userErrors}` back (so :32 never returns true and the catch at :39 never fires), logs 'revert userErrors' at :33 and sleeps 1s — 6 such lines across the 2 requests (13.598871 → 14.823605 → 16.031473; 17.052147 → 18.283352 → 19.518894). (6) The loop exits to the CRITICAL log at :52 (10:27:16.031540Z and 10:27:19.518979Z — the alert line itself). 8 updateArticlePrimary INVALID_VARIABLE entries = 2 publishes + 6 reverts, all wasted Shopify round-trips, which is what stretched each request to ~3.15s. This is the same shop, same id, same 2 requests and same 30-min window already recorded as fingerprints 1ef2myc, 1owm3fs and x7brnu — one cause, four alerts, because the fingerprint is derived from the message line and each layer of the cascade logs its own.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:891` — the single line that converts a 400-class bad input into a 500: catch returns `{}` instead of rethrowing InvalidArticleIdError
- `packages/functions/src/services/shopifyGraphQlService.js:759` — id shape guard whose regex rejects `[CARD]`
- `packages/functions/src/services/shopifyGraphQlService.js:760` — throws InvalidArticleIdError — the exact error name/message logged at 10:27:13.164643Z
- `packages/functions/src/services/shopifyGraphQlService.js:890` — logs the InvalidArticleIdError seen in the logs, immediately before swallowing it
- `packages/functions/src/services/shopifyGraphQlService.js:1098` — toArticleGid concatenates any id into a gid with no digit check — how `gid://shopify/Article/[CARD]` reaches Shopify
- `packages/functions/src/services/shopifyGraphQlService.js:1254` — updateArticlePrimary returns {userErrors} on resp.errors instead of throwing, so updateShopifyArticle's rethrow at :1193 never runs and the caller cannot tell the publish failed
- `packages/functions/src/controllers/appProxyController.js:113` — guard checks only `!id`, never id shape — a present-but-invalid id passes straight through
- `packages/functions/src/controllers/appProxyController.js:129` — `article.isPublished` on the `{}` stub is undefined → falsy → falls through to the publish path
- `packages/functions/src/controllers/appProxyController.js:136` — publishes before validating the article object; the mutation's return value is never inspected
- `packages/functions/src/controllers/appProxyController.js:137` — didPublishForPreview set true unconditionally after a publish that actually failed
- `packages/functions/src/controllers/appProxyController.js:143` — `article.blog.handle` on the stub — the TypeError that becomes the 500
- `packages/functions/src/controllers/appProxyController.js:178` — finally triggers revertArticleToDraft off the bogus flag — the 3 retries in the alert
- `packages/functions/src/controllers/appProxyController.js:33` — the 'revert userErrors' line, 6 occurrences in the window
- `packages/functions/src/controllers/appProxyController.js:52` — the CRITICAL 'article left PUBLISHED' log that fired this alert — a false alarm, since the publish mutation itself was rejected

## Evidence
- 2 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-10-09T10:12:18.959Z" AND timestamp<="2026-10-09T10:42:18.959Z" AND "CRITICAL: article left PUBLISHED after preview"`
- 2 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-10-09T10:12:18.959Z" AND timestamp<="2026-10-09T10:42:18.959Z" AND "InvalidArticleIdError"`
- 2 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-10-09T10:12:18.959Z" AND timestamp<="2026-10-09T10:42:18.959Z" AND "Cannot read properties of undefined (reading 'handle')"`
- 8 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-10-09T10:12:18.959Z" AND timestamp<="2026-10-09T10:42:18.959Z" AND jsonPayload.tag="[updateArticlePrimary]"`
- 6 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-10-09T10:12:18.959Z" AND timestamp<="2026-10-09T10:42:18.959Z" AND "revert userErrors"`
- 2 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-10-09T10:12:18.959Z" AND timestamp<="2026-10-09T10:42:18.959Z" AND httpRequest.status=500 AND httpRequest.requestUrl:"seoOn-preview"`

## Job
- analyze rounds: 1
- cost: $1.14

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
