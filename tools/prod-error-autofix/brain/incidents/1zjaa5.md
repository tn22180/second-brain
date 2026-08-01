fingerprint: 1zjaa5
service: proxy
message: [getPreview] <http://glacierfrostco.myshopify.com|glacierfrostco.myshopify.com> Error fetching the resource: Cannot read properties of undefined (reading 'handle')
app: BLOG
repo: blogs
date: 2026-07-31T18:07:13.875Z
status: mr_open
attempt: 1

# BLOG · proxy · 1zjaa5

**Outcome.** duplicate of 9m7zmo — MR https://gitlab.com/avada/blogs/-/merge_requests/798

**Root cause.** Article gid://shopify/Article/560458924077 no longer exists in Shopify for glacierfrostco.myshopify.com, so getShopifyArticleById catches its own `throw new Error('Article not found')` and returns `{}`; getPreview then reads `article.blog.handle` on that empty object and throws `Cannot read properties of undefined (reading 'handle')` → HTTP 500.

**Mechanism.** ShopifyCrawler/1.0 hits GET /proxy/seoOn-preview?id=560458924077&shop=glacierfrostco.myshopify.com twice (17:18:39.316Z, 17:18:42.700Z, both 500). makeGraphQlApi returns `data.article: null` for the dead gid → processJSONMetafield(null) falsy → `throw new Error('Article not found')` at shopifyGraphQlService.js:852 → caught by that function's own catch at :872 and logged (`[getShopifyArticleById] 3R2cIR3jgvOPswzkjmeg 560458924077 Error: Article not found ... at async getPreview`, 2× at 17:18:39.988 and 17:18:43.000) then downgraded to `return {}` at :874. Back in getPreview, `article.isPublished` on `{}` is undefined → falsy → skips the published branch at appProxyController.js:128, runs the publish mutation at :135 and sets `didPublishForPreview = true` at :136 without inspecting userErrors; then `blogHandle: article.blog.handle` at :142 dereferences `.handle` on undefined → TypeError, caught by the outer catch at :161 → logged `[getPreview] glacierfrostco.myshopify.com Error fetching the resource: Cannot read properties of undefined (reading 'handle')` ~160ms after each 'Article not found' (17:18:40.148, 17:18:43.150) → ctx.status = 500. The `finally` at :169 then runs revertArticleToDraft, whose 3 attempts each come back `[{"field":["id"],"message":"Article does not exist"}]` (6 lines = 2 requests × 3 attempts) ending in the spurious `CRITICAL: article left PUBLISHED after preview` 2× — spurious because nothing was ever published; the article does not exist. Shopify's own userErrors independently confirm the gid is dead.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:852` — throw new Error('Article not found') when resp.data.article is null — real cause, never reaches the caller
- `packages/functions/src/services/shopifyGraphQlService.js:874` — catch returns {}, converting a not-found into a shaped-but-empty success value
- `packages/functions/src/controllers/appProxyController.js:128` — article.isPublished on {} is undefined → falsy → falls through to the publish path instead of erroring out
- `packages/functions/src/controllers/appProxyController.js:135` — publish mutation issued against a non-existent article; its userErrors never inspected
- `packages/functions/src/controllers/appProxyController.js:136` — didPublishForPreview set true regardless of userErrors — triggers the bogus revert + CRITICAL log
- `packages/functions/src/controllers/appProxyController.js:142` — article.blog.handle — the exact TypeError in the alert message
- `packages/functions/src/controllers/appProxyController.js:162` — outer catch logs '[getPreview] ... Error fetching the resource:' and sets 500

## Evidence
- 2 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-07-31T17:03:42.060Z" AND timestamp<="2026-07-31T17:33:42.060Z" AND jsonPayload.message:"Error fetching the resource: Cannot read properties of undefined (reading 'handle')"`
- 2 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-07-31T17:03:42.060Z" AND timestamp<="2026-07-31T17:33:42.060Z" AND jsonPayload.error.message="Article not found"`
- 6 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-07-31T17:03:42.060Z" AND timestamp<="2026-07-31T17:33:42.060Z" AND textPayload:"revert userErrors" AND textPayload:"Article does not exist"`
- 2 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-07-31T17:03:42.060Z" AND timestamp<="2026-07-31T17:33:42.060Z" AND httpRequest.status=500 AND httpRequest.requestUrl:"id=560458924077"`

## Job
- analyze rounds: 1
- cost: $0.77
- MR: https://gitlab.com/avada/blogs/-/merge_requests/798

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
