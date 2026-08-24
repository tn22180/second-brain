fingerprint: x8vfy4
service: proxy
message: [getPreview] CRITICAL: article left PUBLISHED after preview, manual unpublish required <http://4da5bc-31.myshopify.com|4da5bc-31.myshopify.com> articleId=596218773737\
app: BLOG
repo: blogs
date: 2026-08-22T07:31:31.531Z
status: fix_disabled
attempt: 1

# BLOG · proxy · x8vfy4

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** GET /proxy/seoOn-preview was called with the URL-escaped article id `596218773737\` (query `id=596218773737%5C`); getShopifyArticleById throws its own InvalidArticleIdError for that id but its catch swallows it and returns `{}`, so getPreview treats the empty object as an unpublished article, fires the publish mutation (which Shopify rejects with INVALID_VARIABLE but which returns instead of throwing), sets didPublishForPreview=true, crashes on `article.blog.handle`, returns 500, and the finally block emits a false CRITICAL 'left PUBLISHED' alert for an article that was never published. Duplicate of the recorded family 18e2dxz / jnkvv8 / 1uxz3rd (all fix_disabled).

**Mechanism.** 2 requests in the window (09:07:47.361Z and 09:07:50.476Z, latency 2.86s / 2.74s, same signature+timestamp=1787303267, remoteIp 66.249.82.102 and 192.178.14.2), both carrying `id=596218773737%5C` — Koa decodes it to the string `596218773737\`. appProxyController.js:112 passes the `!id` guard because the value is truthy. appProxyController.js:123 calls getShopifyArticleById; shopifyGraphQlService.js:758 normalizes to `596218773737\`, the regex at :759 rejects it and :760 throws InvalidArticleIdError (2 stderr entries, tag=[getShopifyArticleById], stack `at getShopifyArticleById (/workspace/lib/services/shopifyGraphQlService.js:857:13) at getPreview (/workspace/lib/controllers/appProxyController.js:130:76)`). The catch at :889 logs it and :891 returns `{}` instead of rethrowing. appProxyController.js:128 evaluates `article.isPublished` on `{}` → undefined → falsy, so control falls into the publish branch at :135. updateShopifyArticle builds the gid with toArticleGid (shopifyGraphQlService.js:1098, no validation) → `gid://shopify/Article/596218773737\`, Shopify answers a top-level `errors` array `Variable $id of type ID! was provided invalid value / INVALID_VARIABLE / Invalid global id`, and updateArticlePrimary.js:1259 returns `{userErrors: resp.errors}` rather than throwing — so the failed mutation is invisible at the call site and appProxyController.js:136 sets didPublishForPreview=true on a publish that never happened. appProxyController.js:142 then reads `article.blog.handle` on `{}` → `Cannot read properties of undefined (reading 'handle')` (2 entries, tag=[getPreview]) → catch at :162 → ctx.status 500 (2 request-log 500s). The finally at :169 calls revertArticleToDraft, which loops 3× (:27) with a 1s delay, each returning the same INVALID_VARIABLE userErrors (6 'revert userErrors' entries = 2 requests × 3 attempts, plus 6 more [updateArticlePrimary] resp.errors entries — 8 total with the 2 publish attempts), then emits the CRITICAL line at :50 (2 entries). Those revert errors are themselves proof the id is unusable, so nothing was ever published and the CRITICAL claim is false.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:760` — throw new InvalidArticleIdError(id) — the throw named in the prod stack at lib/services/shopifyGraphQlService.js:857
- `packages/functions/src/services/shopifyGraphQlService.js:891` — catch returns {} instead of rethrowing, so the caller cannot tell 'invalid id' from 'article object'
- `packages/functions/src/services/shopifyGraphQlService.js:1098` — toArticleGid concatenates the raw id with no validation, producing gid://shopify/Article/596218773737\ that Shopify rejects
- `packages/functions/src/services/shopifyGraphQlService.js:1259` — a top-level GraphQL errors array is returned as {userErrors} instead of thrown — the publish failure never reaches getPreview's try block
- `packages/functions/src/controllers/appProxyController.js:112` — the only id guard is falsiness; the malformed string `596218773737\` passes it
- `packages/functions/src/controllers/appProxyController.js:128` — article.isPublished on {} is undefined → falsy, so the invalid id takes the publish-for-preview branch
- `packages/functions/src/controllers/appProxyController.js:135` — publish mutation fired with no userErrors check; it failed with INVALID_VARIABLE but resolved normally
- `packages/functions/src/controllers/appProxyController.js:136` — didPublishForPreview = true set on an unverified mutation — this arms the false CRITICAL
- `packages/functions/src/controllers/appProxyController.js:142` — article.blog.handle on {} throws the logged TypeError reading 'handle', producing the 500
- `packages/functions/src/controllers/appProxyController.js:169` — finally calls revertArticleToDraft because didPublishForPreview is true
- `packages/functions/src/controllers/appProxyController.js:50` — the CRITICAL 'left PUBLISHED, manual unpublish required' line that fired this alert

## Evidence
- 2 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-08-21T08:52:51.802Z" AND timestamp<="2026-08-21T09:22:51.802Z" AND textPayload:"CRITICAL: article left PUBLISHED"`
- 2 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-08-21T08:52:51.802Z" AND timestamp<="2026-08-21T09:22:51.802Z" AND jsonPayload.tag="[getShopifyArticleById]"`
- 2 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-08-21T08:52:51.802Z" AND timestamp<="2026-08-21T09:22:51.802Z" AND jsonPayload.tag="[getPreview]"`
- 8 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-08-21T08:52:51.802Z" AND timestamp<="2026-08-21T09:22:51.802Z" AND jsonPayload.tag="[updateArticlePrimary]"`
- 6 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-08-21T08:52:51.802Z" AND timestamp<="2026-08-21T09:22:51.802Z" AND textPayload:"revert userErrors"`
- 2 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-08-21T08:52:51.802Z" AND timestamp<="2026-08-21T09:22:51.802Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $2.04

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
