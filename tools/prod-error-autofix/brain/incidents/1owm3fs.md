fingerprint: 1owm3fs
service: proxy
message: [updateArticlePrimary] iKvkUbMjIuVpAFMIe50Z <gid://shopify/Article/[CARD]> resp.errors [{"message":"Variable $id of type ID! was provided invalid value","locations":[{"line":1,"column":24}],"extensions":{"code":"INVALID_VARIABLE","value":"<gid://shopify/Article/[CARD]>","problems":[{"path":[],"expla
app: BLOG
repo: blogs
date: 2026-10-09T10:34:40.182Z
status: fix_disabled
attempt: 1

# BLOG · proxy · 1owm3fs

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** A non-numeric `id` query param on GET /proxy/seoOn-preview turns into a cascade because three layers swallow their own errors: getShopifyArticleById throws InvalidArticleIdError and its catch returns `{}`, getPreview then treats that stub as an unpublished article and calls updateShopifyArticle, updateArticlePrimary logs Shopify's INVALID_VARIABLE and returns instead of throwing, so `didPublishForPreview` is set true even though nothing was published — producing a 500, 3 pointless revert retries, and a false 'article left PUBLISHED, manual unpublish required' CRITICAL. Same cause family as same-day fingerprint 1ef2myc (same service, same shop full-of-yoga-2.myshopify.com, same id), one layer deeper.

**Mechanism.** Both 500s are crawler GETs (HeadlessChrome from 66.249.82.1 / 66.249.82.64) to /proxy/seoOn-preview?id=%5BCARD%5D&shop=full-of-yoga-2.myshopify.com. The `!id` guard at appProxyController.js:113 passes because the param is present but non-numeric. getShopifyArticleById's shape guard at shopifyGraphQlService.js:759 fails the regex /^(\d+|gid:\/\/shopify\/Article\/\d+)$/ and throws InvalidArticleIdError at :760 — logged at :890 with the prod stack `getShopifyArticleById (lib/services/shopifyGraphQlService.js:860)` ← `getPreview (lib/controllers/appProxyController.js:129)` — but the catch at :891 returns `{}`. Back in getPreview, `article.isPublished` (appProxyController.js:129) is undefined → falsy, so execution falls through to the publish call at :136. That reaches updateArticlePrimary, which sends `gid://shopify/Article/<non-numeric>`; Shopify answers `errors: [{code: INVALID_VARIABLE, "Invalid global id"}]`, logged at shopifyGraphQlService.js:1253 and returned — not thrown — at :1254, so updateShopifyArticle's rethrow at :1193 never fires. appProxyController.js:137 therefore sets didPublishForPreview = true. Line 143 then reads `article.blog.handle` off the `{}` stub → TypeError "Cannot read properties of undefined (reading 'handle')", caught at :171 → ctx.status = 500. The `finally` at :178 sees didPublishForPreview and runs revertArticleToDraft, whose 3 attempts (:28-48) each hit the same invalid gid and log 'revert userErrors', ending in the CRITICAL log at :52. Timestamps confirm the exact order per request, e.g. exec 0tmr1tz85g89: InvalidArticleIdError 10:27:13.164 → updateArticlePrimary resp.errors 10:27:13.386 → getPreview 'handle' 10:27:13.387 → revert 1/3 10:27:13.598 → 2/3 10:27:14.823 → 3/3 + CRITICAL 10:27:16.031.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:891` — catch returns `{}` instead of rethrowing InvalidArticleIdError — the stub that makes every downstream step misbehave
- `packages/functions/src/services/shopifyGraphQlService.js:759` — id shape guard that rejects the non-numeric id; its throw at :760 is the logged InvalidArticleIdError
- `packages/functions/src/services/shopifyGraphQlService.js:1254` — updateArticlePrimary returns {userErrors} on resp.errors instead of throwing, so updateShopifyArticle's rethrow at :1193 never runs
- `packages/functions/src/controllers/appProxyController.js:113` — guard only checks `!id`, not id shape — a present-but-invalid id passes
- `packages/functions/src/controllers/appProxyController.js:129` — `article.isPublished` on the `{}` stub is undefined → falsy → falls through to the publish path
- `packages/functions/src/controllers/appProxyController.js:137` — didPublishForPreview set true unconditionally after a publish that actually failed
- `packages/functions/src/controllers/appProxyController.js:143` — `article.blog.handle` on the stub is the TypeError that produces the 500
- `packages/functions/src/controllers/appProxyController.js:178` — finally triggers revertArticleToDraft off the bogus flag
- `packages/functions/src/controllers/appProxyController.js:52` — the CRITICAL 'article left PUBLISHED' log — a false alarm here, nothing was ever published

## Evidence
- 2 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-10-09T10:12:15.320Z" AND timestamp<="2026-10-09T10:42:15.320Z" AND "InvalidArticleIdError"`
- 8 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-10-09T10:12:15.320Z" AND timestamp<="2026-10-09T10:42:15.320Z" AND jsonPayload.tag="[updateArticlePrimary]"`
- 2 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-10-09T10:12:15.320Z" AND timestamp<="2026-10-09T10:42:15.320Z" AND "Cannot read properties of undefined (reading 'handle')"`
- 6 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-10-09T10:12:15.320Z" AND timestamp<="2026-10-09T10:42:15.320Z" AND "revert userErrors"`
- 2 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-10-09T10:12:15.320Z" AND timestamp<="2026-10-09T10:42:15.320Z" AND "CRITICAL: article left PUBLISHED after preview"`
- 2 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-10-09T10:12:15.320Z" AND timestamp<="2026-10-09T10:42:15.320Z" AND httpRequest.status=500 AND httpRequest.requestUrl:"seoOn-preview"`

## Job
- analyze rounds: 1
- cost: $1.22

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
