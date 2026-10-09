fingerprint: x7brnu
service: proxy
message: [getPreview] revert userErrors <http://full-of-yoga-2.myshopify.com|full-of-yoga-2.myshopify.com> articleId=[CARD] attempt=1/3 [{"message":"Variable $id of type ID! was provided invalid value","locations":[{"line":1,"column":24}],"extensions":{"code":"INVALID_VARIABLE","value":"<gid://shopify/Articl
app: BLOG
repo: blogs
date: 2026-10-09T10:38:18.351Z
status: fix_disabled
attempt: 1

# BLOG · proxy · x7brnu

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Duplicate of recorded fingerprints 1ef2myc and 1owm3fs (same app, service, shop full-of-yoga-2.myshopify.com, same literal id `[CARD]`, same 2 requests in the same 30-min window) — the alert text is just a later line of the same cascade: a present-but-non-numeric `id` on GET /proxy/seoOn-preview is swallowed by three layers, so getPreview publishes nothing, 500s on a `{}` stub, then fails 3 revert retries and emits a false 'article left PUBLISHED' CRITICAL.

**Mechanism.** Both 500s are Googlebot HeadlessChrome GETs (66.249.82.1 / 66.249.82.64) to /proxy/seoOn-preview?id=%5BCARD%5D&shop=full-of-yoga-2.myshopify.com. Re-read raw from GCP, httpRequest.requestUrl literally carries `id=%5BCARD%5D` with the signature unredacted, so `[CARD]` is the real param value, not a log scrubber artifact — the crawler is following a storefront link with an unsubstituted placeholder. The `!id` guard at appProxyController.js:113 passes (param present). getShopifyArticleById's shape guard at shopifyGraphQlService.js:759 fails /^(\d+|gid:\/\/shopify\/Article\/\d+)$/ and throws InvalidArticleIdError at :760 — prod stack `getShopifyArticleById (lib/.../shopifyGraphQlService.js:860)` ← `getPreview (lib/.../appProxyController.js:129)` — logged at :890, then the catch at :891 returns `{}`. `article.isPublished` (appProxyController.js:129) on that stub is undefined → falsy, so control falls to the publish at :136. updateShopifyArticle builds the gid with toArticleGid at :1098, which does no validation, and sends `gid://shopify/Article/[CARD]`; Shopify answers `errors:[{code: INVALID_VARIABLE, 'Invalid global id'}]`, logged at :1253 and **returned** at :1254 rather than thrown, so the rethrow at :1193 never fires and appProxyController.js:137 sets didPublishForPreview = true for a publish that failed. Line 143 reads `article.blog.handle` off `{}` → TypeError "Cannot read properties of undefined (reading 'handle')", caught at :171 → ctx.status 500 (latency 3.14s / 3.15s). The `finally` at :178 trusts the bogus flag and runs revertArticleToDraft, whose 3 attempts (:28-48) each re-send the same invalid gid and log 'revert userErrors' — the alert's own line — ending at the CRITICAL log at :52, which is a false alarm: nothing was ever published, so there is no article to unpublish by hand. Per-request order confirmed by timestamp: InvalidArticleIdError 10:27:13.164 → updateArticlePrimary resp.errors 10:27:13.386 → getPreview 'handle' 10:27:13.387 → revert 1/3 10:27:13.598 → 2/3 10:27:14.823 → 3/3 + CRITICAL 10:27:16.031; the second request repeats it at 10:27:16.612 → 10:27:19.518.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:891` — catch returns `{}` instead of rethrowing InvalidArticleIdError — the stub every downstream step then misreads
- `packages/functions/src/services/shopifyGraphQlService.js:759` — id shape guard that rejects `[CARD]`; its throw at :760 is the logged InvalidArticleIdError
- `packages/functions/src/services/shopifyGraphQlService.js:1254` — updateArticlePrimary returns {userErrors} on resp.errors instead of throwing, so updateShopifyArticle's rethrow at :1193 never runs
- `packages/functions/src/services/shopifyGraphQlService.js:1098` — toArticleGid concatenates any id into a gid with no digit check — how `gid://shopify/Article/[CARD]` reaches Shopify
- `packages/functions/src/controllers/appProxyController.js:113` — guard only checks `!id`, not id shape — a present-but-invalid id passes
- `packages/functions/src/controllers/appProxyController.js:129` — `article.isPublished` on the `{}` stub is undefined → falsy → falls through to the publish path
- `packages/functions/src/controllers/appProxyController.js:137` — didPublishForPreview set true unconditionally after a publish that actually failed
- `packages/functions/src/controllers/appProxyController.js:143` — `article.blog.handle` on the stub is the TypeError that produces the 500
- `packages/functions/src/controllers/appProxyController.js:178` — finally triggers revertArticleToDraft off the bogus flag — the 3 retries in the alert
- `packages/functions/src/controllers/appProxyController.js:52` — the CRITICAL 'article left PUBLISHED' log the cascade ends on — false alarm, nothing was published

## Evidence
- 6 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-10-09T10:12:15.412Z" AND timestamp<="2026-10-09T10:42:15.412Z" AND "revert userErrors"`
- 2 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-10-09T10:12:15.412Z" AND timestamp<="2026-10-09T10:42:15.412Z" AND "InvalidArticleIdError"`
- 2 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-10-09T10:12:15.412Z" AND timestamp<="2026-10-09T10:42:15.412Z" AND "Cannot read properties of undefined (reading 'handle')"`
- 8 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-10-09T10:12:15.412Z" AND timestamp<="2026-10-09T10:42:15.412Z" AND jsonPayload.tag="[updateArticlePrimary]"`
- 2 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-10-09T10:12:15.412Z" AND timestamp<="2026-10-09T10:42:15.412Z" AND "CRITICAL: article left PUBLISHED after preview"`
- 2 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-10-09T10:12:15.412Z" AND timestamp<="2026-10-09T10:42:15.412Z" AND httpRequest.status=500 AND httpRequest.requestUrl:"seoOn-preview"`

## Job
- analyze rounds: 1
- cost: $1.33

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
