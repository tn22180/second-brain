fingerprint: hqfte0
service: proxy
message: [getPreview] revert userErrors <http://glacierfrostco.myshopify.com|glacierfrostco.myshopify.com> articleId=560458924077 attempt=1/3 [{"field":["id"],"message":"Article does not exist"}]
app: BLOG
repo: blogs
date: 2026-07-31T18:05:55.394Z
status: mr_open
attempt: 1

# BLOG · proxy · hqfte0

**Outcome.** duplicate of 9m7zmo — MR https://gitlab.com/avada/blogs/-/merge_requests/798

**Root cause.** Duplicate of fingerprints 9m7zmo / 14ydm3m / phe6lm (MR 798 open, unmerged): article gid://shopify/Article/560458924077 no longer exists on glacierfrostco.myshopify.com, and getShopifyArticleById swallows its own `throw new Error('Article not found')` into `return {}`, so getPreview treats the missing article as unpublished, fires a publish mutation, then dereferences `article.blog.handle` on `{}` and 500s, and the finally-block revert burns 3 retries on the dead id before logging a false CRITICAL.

**Mechanism.** Shopify's Admin GraphQL returns `data.article: null` for the dead gid → processJSONMetafield(null) falsy → `throw new Error('Article not found')` at shopifyGraphQlService.js:852 → caught at :873 (logged: 2 entries with stack `Error: Article not found at getShopifyArticleById (/workspace/lib/services/shopifyGraphQlService.js:947:13) ... at async getPreview (/workspace/lib/controllers/appProxyController.js:129:21)`) and swallowed into `return {}` at :874. Back in getPreview, `article.isPublished` on `{}` is undefined → falsy → skips the published branch at appProxyController.js:128 and calls `updateShopifyArticle({isPublished:true})` at :135; that mutation's userErrors are never inspected, so `didPublishForPreview = true` is set unconditionally at :136 even though nothing was published. Next statement reads `article.blog.handle` at :142 → TypeError "Cannot read properties of undefined (reading 'handle')" (2 entries, one per request) → catch at :161 sets ctx.status = 500 (2 request logs, 2.88s and 3.31s). The `finally` at :169 then runs revertArticleToDraft, which retries updateShopifyArticle 3× with a 1s delay (PREVIEW_REVERT_MAX_ATTEMPTS=3 at :14, PREVIEW_REVERT_RETRY_DELAY_MS=1000 at :15), each returning userErrors [{"field":["id"],"message":"Article does not exist"}] — 6 log lines = 2 requests × 3 attempts — then logs the CRITICAL 'article left PUBLISHED' line 2× at :47, which is false: the article does not exist and was never published. Those 3 wasted retries (2 delays + 3 mutations) are essentially the whole 2.88–3.31s latency.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:852` — throw new Error('Article not found') when Shopify returns data.article: null — the exact message in both logged stacks
- `packages/functions/src/services/shopifyGraphQlService.js:873` — logger.error that emits the '[getShopifyArticleById] 3R2cIR3jgvOPswzkjmeg 560458924077 Error: Article not found' entries
- `packages/functions/src/services/shopifyGraphQlService.js:874` — catch returns {} instead of propagating, so the caller cannot distinguish 'missing' from 'fetched'
- `packages/functions/src/controllers/appProxyController.js:128` — article.isPublished on {} is undefined → falsy → falls through to the publish path for a non-existent article
- `packages/functions/src/controllers/appProxyController.js:135` — publish mutation fired for the dead gid; its userErrors are never checked
- `packages/functions/src/controllers/appProxyController.js:136` — didPublishForPreview set true unconditionally, arming the revert path even though the publish failed
- `packages/functions/src/controllers/appProxyController.js:142` — article.blog.handle on {} throws the TypeError "reading 'handle'" that produces the HTTP 500
- `packages/functions/src/controllers/appProxyController.js:161` — catch logs '[getPreview] ... Error fetching the resource' and sets ctx.status = 500 — the 2 request-log 500s
- `packages/functions/src/controllers/appProxyController.js:169` — finally-block revert runs on the non-existent article
- `packages/functions/src/controllers/appProxyController.js:29` — revertArticleToDraft's updateShopifyArticle call whose userErrors are the alert text 'Article does not exist'
- `packages/functions/src/controllers/appProxyController.js:31` — the '[getPreview] revert userErrors ... attempt=n/3' log line, 6 occurrences in the window
- `packages/functions/src/controllers/appProxyController.js:47` — CRITICAL 'article left PUBLISHED' fires even when the article does not exist — a false page-worthy alert

## Evidence
- 2 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-07-31T17:03:41.902Z" AND timestamp<="2026-07-31T17:33:41.902Z" AND httpRequest.status>=500`
- 2 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-07-31T17:03:41.902Z" AND timestamp<="2026-07-31T17:33:41.902Z" AND severity>=ERROR AND jsonPayload.error.message="Article not found"`
- 2 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-07-31T17:03:41.902Z" AND timestamp<="2026-07-31T17:33:41.902Z" AND severity>=ERROR AND jsonPayload.message:"reading 'handle'"`
- 6 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-07-31T17:03:41.902Z" AND timestamp<="2026-07-31T17:33:41.902Z" AND severity>=ERROR AND textPayload:"revert userErrors"`
- 2 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-07-31T17:03:41.902Z" AND timestamp<="2026-07-31T17:33:41.902Z" AND severity>=ERROR AND textPayload:"CRITICAL: article left PUBLISHED"`

## Job
- analyze rounds: 1
- cost: $0.78
- MR: https://gitlab.com/avada/blogs/-/merge_requests/798

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
