fingerprint: 1uxz3rd
service: proxy
message: [getPreview] revert userErrors <http://4da5bc-31.myshopify.com|4da5bc-31.myshopify.com> articleId=596218773737\ attempt=1/3 [{"message":"Variable $id of type ID! was provided invalid value","locations":[{"line":1,"column":24}],"extensions":{"code":"INVALID_VARIABLE","value":"<gid://shopify/Article/5
app: BLOG
repo: blogs
date: 2026-08-22T07:29:04.077Z
status: fix_disabled
attempt: 1

# BLOG · proxy · 1uxz3rd

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** getShopifyArticleById swallows its own InvalidArticleIdError and returns `{}`, so getPreview treats the malformed id `596218773737\` (query `id=596218773737%5C`) as a valid unpublished article and keeps going: it fires an articleUpdate publish with the invalid gid, sets didPublishForPreview=true regardless of the mutation's errors, then dereferences `article.blog.handle` on the empty object and 500s.

**Mechanism.** GET /proxy/seoOn-preview?id=596218773737%5C&hasPass=false%5C&locale=en以上文章請幫我修改Keyword — every param carrying a trailing %5C — reaches getPreview. The only id guard is `if (!id)` (appProxyController.js:112), which a non-empty string passes. getShopifyArticleById validates properly at shopifyGraphQlService.js:759 (`/^(\d+|gid:\/\/shopify\/Article\/\d+)$/` rejects the trailing backslash) and throws InvalidArticleIdError — logged at 09:07:47.652660Z and 09:07:50.630053Z with stack `at getShopifyArticleById (/workspace/lib/services/shopifyGraphQlService.js:857) at getPreview (/workspace/lib/controllers/appProxyController.js:130)` — but its own catch at line 890 swallows it and returns `{}` (line 891). Back in getPreview, `article.isPublished` is undefined so the published-shortcut at line 128 is skipped; line 135 calls updateShopifyArticle({isPublished:true}), toArticleGid (shopifyGraphQlService.js:1097) blindly builds `gid://shopify/Article/596218773737\`, Shopify answers INVALID_VARIABLE `Invalid global id`, and updateArticlePrimary returns `{userErrors: resp.errors}` instead of throwing (line 1258). Line 136 sets didPublishForPreview = true anyway. Line 142 then reads `article.blog.handle` on `{}` → `Cannot read properties of undefined (reading 'handle')` (logged 09:07:47.797219Z, 09:07:50.787960Z) → catch → ctx.status = 500. The finally at line 169 runs revertArticleToDraft, which retries the same invalid gid 3× (attempt=1/3 47.944841Z, 2/3 49.083725Z, 3/3 50.223052Z) and then logs a false `CRITICAL: article left PUBLISHED after preview` — nothing was ever published, because the publish mutation failed with the same INVALID_VARIABLE.

Confidence: `high`

## Code
- `packages/functions/src/controllers/appProxyController.js:112` — the only id guard is presence-only (`if (!id)`); a syntactically invalid id like `596218773737\` passes it
- `packages/functions/src/services/shopifyGraphQlService.js:759` — the regex correctly rejects the trailing backslash and throws InvalidArticleIdError
- `packages/functions/src/services/shopifyGraphQlService.js:891` — catch returns `{}` — swallows InvalidArticleIdError, so the caller cannot tell a bad id from a valid article
- `packages/functions/src/controllers/appProxyController.js:128` — `article.isPublished` is undefined on `{}`, so the safe early-return path is skipped
- `packages/functions/src/services/shopifyGraphQlService.js:1097` — toArticleGid interpolates the raw id with no validation, producing `gid://shopify/Article/596218773737\`
- `packages/functions/src/services/shopifyGraphQlService.js:1258` — updateArticlePrimary logs resp.errors and returns `{userErrors}` — the caller at appProxyController.js:135 ignores the return
- `packages/functions/src/controllers/appProxyController.js:136` — didPublishForPreview = true is set unconditionally after a publish that failed, arming a bogus revert + CRITICAL alarm
- `packages/functions/src/controllers/appProxyController.js:142` — `article.blog.handle` on `{}` throws the TypeError that becomes the 500
- `packages/functions/src/controllers/appProxyController.js:169` — finally-block revert retries the same invalid gid 3× and emits a false CRITICAL

## Evidence
- 2 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-08-21T08:52:49.497Z" AND timestamp<="2026-08-21T09:22:49.497Z" AND httpRequest.status>=500`
- 2 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-08-21T08:52:49.497Z" AND timestamp<="2026-08-21T09:22:49.497Z" AND severity>=ERROR AND jsonPayload.error.name="InvalidArticleIdError"`
- 6 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-08-21T08:52:49.497Z" AND timestamp<="2026-08-21T09:22:49.497Z" AND severity>=ERROR AND textPayload:"revert userErrors"`
- 2 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-08-21T08:52:49.497Z" AND timestamp<="2026-08-21T09:22:49.497Z" AND severity>=ERROR AND textPayload:"article left PUBLISHED after preview"`
- 2 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-08-21T08:52:49.497Z" AND timestamp<="2026-08-21T09:22:49.497Z" AND severity>=ERROR AND jsonPayload.tag="[getPreview]"`
- 8 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-08-21T08:52:49.497Z" AND timestamp<="2026-08-21T09:22:49.497Z" AND severity>=ERROR AND jsonPayload.message:"updateArticlePrimary"`

## Job
- analyze rounds: 1
- cost: $1.47

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
