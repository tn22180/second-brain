fingerprint: jnkvv8
service: proxy
message: [updateArticlePrimary] EUYCdEfCsD5G2GnXz2Pg <gid://shopify/Article/596218773737\> resp.errors [{"message":"Variable $id of type ID! was provided invalid value","locations":[{"line":1,"column":24}],"extensions":{"code":"INVALID_VARIABLE","value":"<gid://shopify/Article/596218773737\\>","problems":[{"
app: BLOG
repo: blogs
date: 2026-08-22T07:26:51.746Z
status: fix_disabled
attempt: 1

# BLOG · proxy · jnkvv8

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** GET /proxy/seoOn-preview was called with the URL-escaped article id `596218773737\` (query `id=596218773737%5C`), and getPreview never validates `id` beyond a truthiness check, so the malformed id flowed into every downstream Shopify call: getShopifyArticleById threw InvalidArticleIdError and its own catch swallowed it into `{}`, and getPreview then dereferenced `article.blog.handle` on that `{}` and returned 500.

**Mechanism.** Both 500s in the window are the same request replayed twice (identical URL and signature, 2.74s and 2.86s). (1) appProxyController.getPreview:112 only checks `!id`, so `"596218773737\\"` passes. (2) getShopifyArticleById normalizes the id (normalizeShopifyGid returns any string unchanged) and fails the `/^(\d+|gid:\/\/shopify\/Article\/\d+)$/` test at shopifyGraphQlService.js:759, throwing InvalidArticleIdError — logged at 09:07:47.652Z / 09:07:50.630Z with stack `getShopifyArticleById (/workspace/lib/services/shopifyGraphQlService.js:857) at getPreview (/workspace/lib/controllers/appProxyController.js:130)`. (3) The catch at shopifyGraphQlService.js:890-891 swallows it and returns `{}`. (4) getPreview:128 reads `article.isPublished` → undefined → falsy, so it proceeds to publish-for-preview at :135; toArticleGid (shopifyGraphQlService.js:1097) does no validation and builds `gid://shopify/Article/596218773737\`, which Shopify rejects with INVALID_VARIABLE `Invalid global id`; updateArticlePrimary logs it and returns `{userErrors}` instead of throwing (shopifyGraphQlService.js:1258-1259), so `didPublishForPreview = true` is set even though nothing was published. (5) getPreview:142 reads `article.blog.handle` on `{}` → `Cannot read properties of undefined (reading 'handle')` (logged 09:07:47.797Z / 09:07:50.788Z) → catch at :161 sets ctx.status 500. (6) The `finally` at :169 runs revertArticleToDraft, which retries the same invalid gid 3× (1s apart) and then logs `CRITICAL: article left PUBLISHED after preview, manual unpublish required` — a false alarm, since the publish itself had already failed. Same defect family as recorded fingerprint 18e2dxz.

Confidence: `high`

## Code
- `packages/functions/src/controllers/appProxyController.js:112` — Only guard on `id` is `if (!id)`; a non-empty but malformed id like `596218773737\` passes straight through
- `packages/functions/src/services/shopifyGraphQlService.js:759` — Regex rejects the id and throws InvalidArticleIdError — the first failure in the chain
- `packages/functions/src/services/shopifyGraphQlService.js:891` — catch swallows InvalidArticleIdError and returns `{}`, so the caller cannot tell a bad id from a valid article
- `packages/functions/src/controllers/appProxyController.js:128` — `article.isPublished` on `{}` is undefined, so the empty-object sentinel is treated as an unpublished article
- `packages/functions/src/services/shopifyGraphQlService.js:1097` — toArticleGid concatenates the raw id with no validation, producing `gid://shopify/Article/596218773737\`
- `packages/functions/src/services/shopifyGraphQlService.js:1259` — updateArticlePrimary returns `{userErrors}` on resp.errors instead of throwing, so the failed publish is invisible to getPreview
- `packages/functions/src/controllers/appProxyController.js:142` — `article.blog.handle` on `{}` throws the TypeError that produces the 500
- `packages/functions/src/controllers/appProxyController.js:169` — finally reverts on didPublishForPreview, which was set even though the publish failed — drives the 3 failed reverts and the false CRITICAL log

## Evidence
- 2 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-21T08:52:49.487Z" AND timestamp<="2026-08-21T09:22:49.487Z" AND httpRequest.status>=500`
- 20 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-21T08:52:49.487Z" AND timestamp<="2026-08-21T09:22:49.487Z" AND "596218773737"`
- 2 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-21T08:52:49.487Z" AND timestamp<="2026-08-21T09:22:49.487Z" AND "InvalidArticleIdError"`
- 2 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-21T08:52:49.487Z" AND timestamp<="2026-08-21T09:22:49.487Z" AND "Cannot read properties of undefined (reading 'handle')"`
- 2 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-21T08:52:49.487Z" AND timestamp<="2026-08-21T09:22:49.487Z" AND "CRITICAL: article left PUBLISHED after preview"`

## Job
- analyze rounds: 1
- cost: $1.73

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
