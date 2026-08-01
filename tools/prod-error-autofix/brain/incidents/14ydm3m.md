fingerprint: 14ydm3m
service: proxy
message: HTTP 500 GET /proxy/seoOn-preview
app: BLOG
repo: blogs
date: 2026-07-31T14:50:33.811Z
status: mr_open
attempt: 1

# BLOG · proxy · 14ydm3m

**Outcome.** duplicate of phe6lm — MR https://gitlab.com/avada/blogs/-/merge_requests/798

**Root cause.** getShopifyArticleById swallows its own `throw new Error('Article not found')` and returns `{}`, so getPreview treats a deleted article (gid://shopify/Article/560458924077 on glacierfrostco.myshopify.com) as an existing unpublished one, publishes it, then dereferences `article.blog.handle` on the empty object and answers 500 instead of 404.

**Mechanism.** All 4 seoOn-preview 500s in the window are one shop/one article id. Shopify's Admin GraphQL returns `data.article: null`; processJSONMetafield(null) returns null unchanged (articlesHelper.js:120), so shopifyGraphQlService.js:852 throws 'Article not found' — the stack in the logs confirms it (`getShopifyArticleById (lib/services/shopifyGraphQlService.js:947)` ← `getPreview (lib/controllers/appProxyController.js:129)`). Its own catch at :872 logs the error (4 `[getShopifyArticleById]` entries, one per request) and returns `{}` at :874, hiding the not-found from the caller. In getPreview, `article.isPublished` is undefined so the published-branch (appProxyController.js:128) is skipped; line 135 fires the publish mutation against a nonexistent article and line 136 sets didPublishForPreview = true. Line 142 then reads `article.blog.handle` on `{}` → `Cannot read properties of undefined (reading 'handle')`, logged verbatim by the catch at :162 (4 entries, 1:1 with the 500s) → `ctx.status = 500` at :163. The `finally` at :169 runs revertArticleToDraft, which retries 3× with a 1000ms delay and gets `[{"field":["id"],"message":"Article does not exist"}]` each time (12 = 4×3 entries), then emits the false 'CRITICAL: article left PUBLISHED' (4 entries) — the article was never published because it does not exist. The 3 retries also explain the request latencies: 2.887s, 2.912s, 2.991s, 3.691s.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:852` — `throw new Error('Article not found')` — the throw named in the logged stack (lib:947)
- `packages/functions/src/services/shopifyGraphQlService.js:874` — catch returns `{}`, converting a not-found into a truthy empty article the caller cannot distinguish from a real one
- `packages/functions/src/helpers/articlesHelper.js:120` — `if (!articleObj ...) return articleObj` passes null straight through, so `!data` at :851 is the only not-found detection
- `packages/functions/src/controllers/appProxyController.js:123` — getPreview's call site; result is used with no existence check
- `packages/functions/src/controllers/appProxyController.js:128` — `article.isPublished` on `{}` is undefined, so the safe early-return branch is skipped
- `packages/functions/src/controllers/appProxyController.js:135` — publishes an article that does not exist, then sets didPublishForPreview
- `packages/functions/src/controllers/appProxyController.js:142` — `article.blog.handle` — the TypeError `reading 'handle'` that produces the 500
- `packages/functions/src/controllers/appProxyController.js:162` — catch logs `[getPreview] ... Error fetching the resource:` with that exact message, then :163 sets status 500
- `packages/functions/src/controllers/appProxyController.js:169` — finally runs the 3× revert loop on an article that was never published — source of the 12 userErrors lines, the false CRITICAL, and ~3s of the request latency
- `packages/functions/src/controllers/appProxyController.js:112` — the existing missing-id guard returns 400; the equivalent article-not-found guard is absent

## Evidence
- 4 matching entries: `resource.labels.service_name="proxy" AND httpRequest.status>=500 AND httpRequest.requestUrl:"seoOn-preview" AND timestamp>="2026-07-31T13:10:24Z" AND timestamp<="2026-07-31T13:40:25Z"`
- 4 matching entries: `resource.labels.service_name="proxy" AND jsonPayload.tag="[getShopifyArticleById]" AND jsonPayload.error.message="Article not found" AND timestamp>="2026-07-31T13:10:24Z" AND timestamp<="2026-07-31T13:40:25Z"`
- 4 matching entries: `resource.labels.service_name="proxy" AND jsonPayload.tag="[getPreview]" AND jsonPayload.message:"reading 'handle'" AND timestamp>="2026-07-31T13:10:24Z" AND timestamp<="2026-07-31T13:40:25Z"`
- 12 matching entries: `resource.labels.service_name="proxy" AND textPayload:"revert userErrors" AND timestamp>="2026-07-31T13:10:24Z" AND timestamp<="2026-07-31T13:40:25Z"`
- 4 matching entries: `resource.labels.service_name="proxy" AND textPayload:"CRITICAL: article left PUBLISHED after preview" AND timestamp>="2026-07-31T13:10:24Z" AND timestamp<="2026-07-31T13:40:25Z"`

## Job
- analyze rounds: 1
- cost: $1.14
- MR: https://gitlab.com/avada/blogs/-/merge_requests/798

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
