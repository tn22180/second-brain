fingerprint: 18e2dxz
service: proxy
message: [getShopifyArticleById] EUYCdEfCsD5G2GnXz2Pg 596218773737\ InvalidArticleIdError: Article id could not be resolved to a gid: "596218773737\\"
app: BLOG
repo: blogs
date: 2026-08-22T07:24:16.649Z
status: fix_disabled
attempt: 1

# BLOG · proxy · 18e2dxz

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** getShopifyArticleById throws InvalidArticleIdError for the malformed id `596218773737\` but its own catch swallows it and returns `{}` (shopifyGraphQlService.js:891), so getPreview treats the empty object as a real article, publishes it, then dereferences `article.blog.handle` and 500s.

**Mechanism.** The App Proxy request arrived with every query value backslash-mangled (`id=596218773737%5C`, `hasPass=false%5C`, `noCache=...%5C`, `locale=en以上文章請幫我修改Keyword`) — a hand-pasted/AI-mangled preview URL. appProxyController.js:112 only checks `!id`, so `"596218773737\\"` passes. getShopifyArticleById normalizes it, the regex `/^(\d+|gid:\/\/shopify\/Article\/\d+)$/` rejects it, and line 760 throws InvalidArticleIdError — logged at 09:07:47.652660Z and 09:07:50.630053Z. The catch at line 890 logs and `return {}` (line 891). Back in getPreview, `article.isPublished` is undefined so line 135 fires updateShopifyArticle publish, which Shopify rejects with INVALID_VARIABLE `Invalid global id 'gid://shopify/Article/596218773737\'` (logged 09:07:47.796625Z) — the return value is never checked, so line 136 sets didPublishForPreview = true anyway. Line 142 then reads `article.blog.handle` on `{}` and throws `Cannot read properties of undefined (reading 'handle')` (09:07:47.797219Z), caught at line 162 → ctx.status = 500. The `finally` at line 169 then runs revertArticleToDraft, whose 3 attempts all fail with the same INVALID_VARIABLE (attempt=1/3 09:07:47.944841Z → 3/3 09:07:50.223052Z), ending in the false `CRITICAL: article left PUBLISHED after preview` — nothing was ever published, because the publish mutation failed too.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:891` — catch returns `{}` instead of rethrowing, converting the named InvalidArticleIdError into a silently-empty article object
- `packages/functions/src/services/shopifyGraphQlService.js:760` — throws InvalidArticleIdError for `596218773737\` — the exact error in the alert stack
- `packages/functions/src/controllers/appProxyController.js:112` — id guard checks presence only; a backslash-suffixed id passes straight through
- `packages/functions/src/controllers/appProxyController.js:135` — publishes before validating the article object; the mutation's userErrors are never inspected
- `packages/functions/src/controllers/appProxyController.js:136` — sets didPublishForPreview = true unconditionally, so the finally block reverts an article that was never published
- `packages/functions/src/controllers/appProxyController.js:142` — `article.blog.handle` on the `{}` returned by the swallowed error — the TypeError that becomes the 500

## Evidence
- 2 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-21T08:52:49.439Z" AND timestamp<="2026-08-21T09:22:49.439Z" AND severity>=ERROR AND jsonPayload.error.name="InvalidArticleIdError"`
- 2 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-21T08:52:49.439Z" AND timestamp<="2026-08-21T09:22:49.439Z" AND severity>=ERROR AND jsonPayload.message:"Error fetching the resource: Cannot read properties of undefined"`
- 2 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-21T08:52:49.439Z" AND timestamp<="2026-08-21T09:22:49.439Z" AND httpRequest.status=500 AND httpRequest.requestUrl:"seoOn-preview"`
- 2 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-08-21T08:52:49.439Z" AND timestamp<="2026-08-21T09:22:49.439Z" AND severity>=ERROR AND textPayload:"CRITICAL: article left PUBLISHED after preview"`

## Job
- analyze rounds: 2
- cost: $2.50

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
