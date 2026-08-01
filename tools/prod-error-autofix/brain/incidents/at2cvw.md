fingerprint: at2cvw
service: proxy
message: [getShopifyArticleById] 3R2cIR3jgvOPswzkjmeg 560458924077 Error: Article not found
app: BLOG
repo: blogs
date: 2026-07-31T18:08:30.028Z
status: mr_open
attempt: 1

# BLOG · proxy · at2cvw

**Outcome.** duplicate of 9m7zmo — MR https://gitlab.com/avada/blogs/-/merge_requests/798

**Root cause.** getShopifyArticleById catches its own `throw new Error('Article not found')` and returns `{}`, so getPreview treats deleted article 560458924077 (shop glacierfrostco.myshopify.com) as an unpublished article, publishes it, then TypeErrors on `article.blog.handle` — producing the 500, three futile revert retries and a false CRITICAL 'left PUBLISHED' alert. Same defect and same article as fingerprint at2cvw / 9m7zmo / 14ydm3m / 1zjaa5 / hqfte0 (MR 798 open, unmerged).

**Mechanism.** GET /proxy/seoOn-preview?id=560458924077&shop=glacierfrostco.myshopify.com → appProxyController.js:123 calls getShopifyArticleById. Shopify's `article(id:)` resolves null (article deleted — confirmed by Shopify's own userErrors `{"field":["id"],"message":"Article does not exist"}` on every revert attempt), so processJSONMetafield(resp.data?.article) is falsy and shopifyGraphQlService.js:852 throws 'Article not found'. The wrapping catch at :873 logs it (the exact stack in the alert) and :874 returns `{}` instead of rethrowing. Back in getPreview, `article.isPublished` on `{}` is undefined → falsy → the not-published branch runs: :135 fires the publish mutation against a non-existent article (its userErrors are discarded) and :136 sets didPublishForPreview = true. The next statement, :142, dereferences `article.blog.handle` on `{}` → TypeError "Cannot read properties of undefined (reading 'handle')" → catch at :162 logs it and sets ctx.status = 500. The `finally` at :169 then runs revertArticleToDraft because the flag is set; it retries 3× (:26-46), each getting `Article does not exist`, and ends at the CRITICAL log :48-52. Logs match 1:1: each of the 2 requests emits exactly 6 entries in that order (stack → handle TypeError → revert 1/3, 2/3, 3/3 → CRITICAL). 2 × 6 = 12 app lines + 2 request-log ERROR entries = the 14-entry errors read; stderr=13 is those 12 plus one unrelated `[verifyAppProxySignature] Invalid signature namai-casa.myshopify.com` at 17:06:24.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:852` — throw new Error('Article not found') when processJSONMetafield(resp.data?.article) is falsy — the message and frame in the alert stack
- `packages/functions/src/services/shopifyGraphQlService.js:873` — catch logs '[getShopifyArticleById]' shop.id 3R2cIR3jgvOPswzkjmeg id 560458924077 e — the exact prod log line
- `packages/functions/src/services/shopifyGraphQlService.js:874` — returns {} instead of rethrowing, so the caller cannot distinguish 'not found' from a valid article
- `packages/functions/src/controllers/appProxyController.js:123` — getPreview's call site; no emptiness guard on the returned object
- `packages/functions/src/controllers/appProxyController.js:128` — `article.isPublished` on {} is undefined → falsy → falls through into the publish path for a deleted article
- `packages/functions/src/controllers/appProxyController.js:135` — publish mutation issued against article 560458924077 that does not exist; its userErrors are discarded
- `packages/functions/src/controllers/appProxyController.js:142` — `article.blog.handle` on {} throws the TypeError that becomes the 500
- `packages/functions/src/controllers/appProxyController.js:162` — catch logs '[getPreview] ... Error fetching the resource: Cannot read properties of undefined (reading handle)' and sets ctx.status = 500
- `packages/functions/src/controllers/appProxyController.js:169` — finally runs revertArticleToDraft because didPublishForPreview is true, driving the 3 retries and the false CRITICAL alert
- `packages/functions/src/controllers/appProxyController.js:51` — CRITICAL 'article left PUBLISHED after preview, manual unpublish required' — fires twice though nothing was ever published

## Evidence
- 2 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-07-31T17:03:43.483Z" AND timestamp<="2026-07-31T17:33:43.483Z" AND httpRequest.status>=500`
- 2 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-07-31T17:03:43.483Z" AND timestamp<="2026-07-31T17:33:43.483Z" AND severity>=ERROR AND jsonPayload.error.message="Article not found"`
- 2 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-07-31T17:03:43.483Z" AND timestamp<="2026-07-31T17:33:43.483Z" AND severity>=ERROR AND jsonPayload.message:"Cannot read properties of undefined (reading 'handle')"`
- 6 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-07-31T17:03:43.483Z" AND timestamp<="2026-07-31T17:33:43.483Z" AND severity>=ERROR AND textPayload:"revert userErrors"`
- 2 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-07-31T17:03:43.483Z" AND timestamp<="2026-07-31T17:33:43.483Z" AND severity>=ERROR AND textPayload:"CRITICAL: article left PUBLISHED"`

## Job
- analyze rounds: 1
- cost: $0.68
- MR: https://gitlab.com/avada/blogs/-/merge_requests/798

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
