fingerprint: zfa04j
service: proxy
message: [getPreview] revert userErrors <http://d169f2-a1.myshopify.com|d169f2-a1.myshopify.com> articleId=PII_REMOVED_83E9B775F636F392C39E9D8882B7ECF1 attempt=1/3 [{"field":["id"],"message":"Article does not exist"}]
app: BLOG
repo: blogs
date: 2026-09-27T07:30:46.962Z
status: fix_disabled
attempt: 1

# BLOG · proxy · zfa04j

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** GET /proxy/seoOn-preview was called twice with an `id` that is neither a bare numeric id nor an Article gid, so getShopifyArticleById threw its own InvalidArticleIdError, swallowed it into `return {}`, and getPreview then published-then-dereferenced `article.blog.handle` on that empty object — 500, plus 3 futile revert attempts and a false CRITICAL per request.

**Mechanism.** Both 500s carry the same `id` query value (same PII hash, same noCache uuid 43ca35c4-97fb-4f5f-bff3-9722a4d380b2 — one browser firing twice 3.2s apart). getPreview passes ctx.query.id straight to getShopifyArticleById (appProxyController.js:124). normalizeShopifyGid returns the string unchanged for a string input (normalizeShopifyGid.js:10), the guard regex /^(\d+|gid:\/\/shopify\/Article\/\d+)$/ rejects it (shopifyGraphQlService.js:758) and `throw new InvalidArticleIdError(id)` fires at :759 — exactly the 2 logged entries `InvalidArticleIdError: Article id could not be resolved to a gid` whose prod stack is `at getShopifyArticleById (/workspace/lib/services/shopifyGraphQlService.js:859:13) at getPreview (/workspace/lib/controllers/appProxyController.js:130:76)` (lib line numbers; src equivalents :759 / :124). The function's own catch at :888 logs it at :889 and swallows it into `return {}` at :890, so the caller cannot tell 'bad id' from 'fetched'. Back in getPreview, `article.isPublished` on `{}` is undefined → falsy → skips the published branch at :129 and fires `updateShopifyArticle({isPublished: true})` at :136; that call's userErrors are never inspected (and it did not throw — no `[updateShopifyArticle]` entry exists in the window), so `didPublishForPreview = true` is set unconditionally at :137 even though nothing was published. The next statement reads `article.blog.handle` at :143 → `TypeError: Cannot read properties of undefined (reading 'handle')` — the 2 logged `[getPreview] ... Error fetching the resource` entries — caught at :171, `ctx.status = 500` at :172 (the 2 request-log 500s). The `finally` at :178 then runs revertArticleToDraft, whose updateShopifyArticle at :30 returns `[{"field":["id"],"message":"Article does not exist"}]` on all 3 attempts (PREVIEW_REVERT_MAX_ATTEMPTS = 3 at :16) — 6 log lines at :33 = 2 requests × 3 attempts, the alert text itself — then logs the CRITICAL 'article left PUBLISHED' line at :51 twice, which is false: the article was never published and does not exist. Per-request timeline is exact for request 2: request starts 07:16:06.739, InvalidArticleIdError 06.903, handle TypeError 07.046, revert attempts 07.205 / 08.349 / 09.517, CRITICAL 09.517 → 2.777s, matching the logged 2.777400795s latency; request 1 likewise 07:16:03.527 → 06.560 = 3.027s vs logged 3.026931206s. The two 1s delays at :48 plus 3 mutations are ~2.3s of every ~2.8-3.0s failure.

Confidence: `high`

## Code
- `packages/functions/src/helpers/utils/normalizeShopifyGid.js:10` — a string id is returned untouched, so a malformed query-param id reaches the guard as-is
- `packages/functions/src/services/shopifyGraphQlService.js:758` — guard regex ^(\d+|gid://shopify/Article/\d+)$ rejects the id this request sent
- `packages/functions/src/services/shopifyGraphQlService.js:759` — throw new InvalidArticleIdError(id) — the exact error name and message in both logged stacks
- `packages/functions/src/services/shopifyGraphQlService.js:888` — catch that intercepts its own InvalidArticleIdError instead of letting it reach the caller
- `packages/functions/src/services/shopifyGraphQlService.js:889` — logger.error emitting the 2 jsonPayload.error.name=InvalidArticleIdError entries
- `packages/functions/src/services/shopifyGraphQlService.js:890` — return {} — the root defect: caller cannot distinguish an invalid id from a fetched article
- `packages/functions/src/controllers/appProxyController.js:124` — getPreview's getShopifyArticleById call, the frame named in both prod stacks (lib appProxyController.js:130)
- `packages/functions/src/controllers/appProxyController.js:129` — article.isPublished on {} is undefined → falls through to the publish path for a non-existent article
- `packages/functions/src/controllers/appProxyController.js:136` — publish mutation fired for the unresolvable id; its userErrors are never checked
- `packages/functions/src/controllers/appProxyController.js:137` — didPublishForPreview set true unconditionally, arming the revert path even though the publish failed
- `packages/functions/src/controllers/appProxyController.js:143` — article.blog.handle on {} throws the TypeError "reading 'handle'" that produces the HTTP 500
- `packages/functions/src/controllers/appProxyController.js:171` — logger.error emitting the 2 "[getPreview] ... Cannot read properties of undefined (reading 'handle')" entries
- `packages/functions/src/controllers/appProxyController.js:172` — ctx.status = 500 — the 2 request-log 500s at 2.777s and 3.027s
- `packages/functions/src/controllers/appProxyController.js:178` — finally-block revert runs against an id Shopify cannot resolve
- `packages/functions/src/controllers/appProxyController.js:30` — revertArticleToDraft's updateShopifyArticle call whose userErrors are the alert text 'Article does not exist'
- `packages/functions/src/controllers/appProxyController.js:33` — the '[getPreview] revert userErrors ... attempt=n/3' log — 6 occurrences in the window, the alerted message
- `packages/functions/src/controllers/appProxyController.js:48` — 1s delay between revert attempts — 2 per request, ~2s of the 2.8-3.0s latency
- `packages/functions/src/controllers/appProxyController.js:51` — CRITICAL 'article left PUBLISHED' fires even though nothing was published — a false page-worthy alert, 2 occurrences
- `packages/functions/src/services/shopifyGraphQlService.js:1181` — updateShopifyArticle returns the mutation payload (userErrors) rather than throwing on 'Article does not exist' — no [updateShopifyArticle] entry exists in the window

## Evidence
- 2 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-09-27T07:01:26.718Z" AND timestamp<="2026-09-27T07:31:26.718Z" AND httpRequest.status>=500`
- 2 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-09-27T07:01:26.718Z" AND timestamp<="2026-09-27T07:31:26.718Z" AND severity>=ERROR AND jsonPayload.error.name="InvalidArticleIdError"`
- 2 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-09-27T07:01:26.718Z" AND timestamp<="2026-09-27T07:31:26.718Z" AND severity>=ERROR AND jsonPayload.message:"reading 'handle'"`
- 6 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-09-27T07:01:26.718Z" AND timestamp<="2026-09-27T07:31:26.718Z" AND severity>=ERROR AND textPayload:"revert userErrors"`
- 2 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-09-27T07:01:26.718Z" AND timestamp<="2026-09-27T07:31:26.718Z" AND severity>=ERROR AND textPayload:"CRITICAL: article left PUBLISHED"`

## Job
- analyze rounds: 2
- cost: $4.01

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
