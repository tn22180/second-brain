fingerprint: 1s3aso7
service: proxy
message: [getPreview] revert userErrors <http://snowverb.myshopify.com|snowverb.myshopify.com> articleId=removed attempt=2/3 [{"field":["id"],"message":"Article does not exist"}]
app: BLOG
repo: blogs
date: 2026-08-03T00:32:03.402Z
status: mr_open
attempt: 1

# BLOG · proxy · 1s3aso7

**Outcome.** duplicate of wtekj7 — MR https://gitlab.com/avada/blogs/-/merge_requests/798

**Root cause.** Same defect family as open MR 798 (fingerprints 9m7zmo / 14ydm3m / at2cvw / hqfte0), now on snowverb.myshopify.com: the previewed article gid no longer resolves in Shopify, getShopifyArticleById swallows its own `throw new Error('Article not found')` into `return {}`, so getPreview treats the missing article as unpublished, fires a publish mutation without checking userErrors, then dereferences `article.blog.handle` on `{}` and 500s, and the finally-block revert burns 3 retries on the dead id before logging a false CRITICAL.

**Mechanism.** Shopify Admin GraphQL returns `data.article: null` for the dead gid → `processJSONMetafield(resp.data?.article)` is falsy at shopifyGraphQlService.js:850-851 → `throw new Error('Article not found')` at :852 → caught at :872, logged at :873 (6 entries, stack `Error: Article not found at getShopifyArticleById (/workspace/lib/services/shopifyGraphQlService.js:947:13) ... at async getPreview (/workspace/lib/controllers/appProxyController.js:129:21)` — lib line numbers, src equivalents are :852/:123) and swallowed into `return {}` at :874. Back in getPreview, `article.isPublished` on `{}` is undefined → falsy → skips the published branch at appProxyController.js:128 and calls `updateShopifyArticle({isPublished:true})` at :135; that mutation's userErrors are never inspected, so `didPublishForPreview = true` is set unconditionally at :136 even though nothing was published. The next statement reads `article.blog.handle` at :142 → TypeError "Cannot read properties of undefined (reading 'handle')" (6 entries, one per request) → catch at :161 logs at :162 and sets `ctx.status = 500` at :163 (6 request logs, 2.835–3.030s). The `finally` at :169 then runs revertArticleToDraft (:26), whose updateShopifyArticle at :29 returns userErrors `[{"field":["id"],"message":"Article does not exist"}]` on all 3 attempts (PREVIEW_REVERT_MAX_ATTEMPTS=3 at :15, PREVIEW_REVERT_RETRY_DELAY_MS=1000 at :16) — 18 log lines at :32 = 6 requests × 3 attempts — then logs the CRITICAL line at :50 six times, which is false: the article does not exist and was never published. Per-request timeline is exact: request starts 00:24:38.109, 'Article not found' 38.542, handle TypeError 38.686, revert attempts 38.833 / 39.982 / 41.141, CRITICAL 41.141 → 3.03s, matching the logged 3.030461684s latency. The 2 × 1s delays plus 3 mutations are ~2.3s of every 2.8–3.0s failure.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:850` — processJSONMetafield(resp.data?.article) returns falsy when Shopify answers data.article: null for the dead gid
- `packages/functions/src/services/shopifyGraphQlService.js:852` — throw new Error('Article not found') — the exact message in all 6 logged stacks
- `packages/functions/src/services/shopifyGraphQlService.js:873` — logger.error that emits the 6 jsonPayload.error.message='Article not found' entries
- `packages/functions/src/services/shopifyGraphQlService.js:874` — catch returns {} instead of propagating, so the caller cannot distinguish 'missing' from 'fetched' — the root defect
- `packages/functions/src/controllers/appProxyController.js:123` — getPreview's getShopifyArticleById call — the frame named in every stack (lib appProxyController.js:129)
- `packages/functions/src/controllers/appProxyController.js:128` — article.isPublished on {} is undefined → falsy → falls through to the publish path for a non-existent article
- `packages/functions/src/controllers/appProxyController.js:135` — publish mutation fired for the dead gid; its userErrors are never checked
- `packages/functions/src/controllers/appProxyController.js:136` — didPublishForPreview set true unconditionally, arming the revert path even though the publish failed
- `packages/functions/src/controllers/appProxyController.js:142` — article.blog.handle on {} throws the TypeError "reading 'handle'" that produces the HTTP 500
- `packages/functions/src/controllers/appProxyController.js:162` — logger.error emitting the 6 jsonPayload.message '[getPreview] ... Error fetching the resource: Cannot read properties of undefined (reading 'handle')' entries
- `packages/functions/src/controllers/appProxyController.js:163` — ctx.status = 500 — the 6 request-log 500s at 2.835–3.030s
- `packages/functions/src/controllers/appProxyController.js:169` — finally-block revert runs against the non-existent article
- `packages/functions/src/controllers/appProxyController.js:29` — revertArticleToDraft's updateShopifyArticle call whose userErrors are the alert text 'Article does not exist'
- `packages/functions/src/controllers/appProxyController.js:32` — the '[getPreview] revert userErrors ... attempt=n/3' log line — 18 occurrences in the window, the alert message itself
- `packages/functions/src/controllers/appProxyController.js:47` — 1s delay between revert attempts — 2 delays per request, ~2s of the 2.8–3.0s latency
- `packages/functions/src/controllers/appProxyController.js:50` — CRITICAL 'article left PUBLISHED' fires even when the article does not exist — a false page-worthy alert, 6 occurrences

## Evidence
- 6 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-08-03T00:09:52.212Z" AND timestamp<="2026-08-03T00:39:52.212Z" AND httpRequest.status>=500`
- 6 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-08-03T00:09:52.212Z" AND timestamp<="2026-08-03T00:39:52.212Z" AND severity>=ERROR AND jsonPayload.error.message="Article not found"`
- 6 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-08-03T00:09:52.212Z" AND timestamp<="2026-08-03T00:39:52.212Z" AND severity>=ERROR AND jsonPayload.message:"reading 'handle'"`
- 18 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-08-03T00:09:52.212Z" AND timestamp<="2026-08-03T00:39:52.212Z" AND severity>=ERROR AND textPayload:"revert userErrors"`
- 6 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-08-03T00:09:52.212Z" AND timestamp<="2026-08-03T00:39:52.212Z" AND severity>=ERROR AND textPayload:"CRITICAL: article left PUBLISHED"`

## Job
- analyze rounds: 2
- cost: $2.11
- MR: https://gitlab.com/avada/blogs/-/merge_requests/798

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
