fingerprint: 1tyfxwg
service: proxy
message: [getShopifyArticleById] 8lGgNHsaWZhV1UYGUKAg PII_REMOVED_83E9B775F636F392C39E9D8882B7ECF1 InvalidArticleIdError: Article id could not be resolved to a gid: "PII_REMOVED_83E9B775F636F392C39E9D8882B7ECF1"
app: BLOG
repo: blogs
date: 2026-09-27T07:50:47.781Z
status: fix_disabled
attempt: 1

# BLOG · proxy · 1tyfxwg

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Duplicate of recorded fingerprint zfa04j (same app, service, shop, window and the same two requests — fingerprint differs only because this alert matched the InvalidArticleIdError line instead of the revert-userErrors line, and no fix has landed on master): GET /proxy/seoOn-preview was called twice with an `id` that is neither a bare numeric id nor an Article gid, so getShopifyArticleById threw its own InvalidArticleIdError, swallowed it into `return {}`, and getPreview then dereferenced `article.blog.handle` on that empty object — HTTP 500, plus 3 futile revert attempts and a false CRITICAL per request.

**Mechanism.** Both 500s carry the same `id` query value (same PII hash) and the same noCache uuid 43ca35c4-97fb-4f5f-bff3-9722a4d380b2 — one browser firing twice 3.2s apart. getPreview passes ctx.query.id straight into getShopifyArticleById (appProxyController.js:124 — the `at getPreview (/workspace/lib/controllers/appProxyController.js:130:76)` frame in both stacks). normalizeShopifyGid returns a string input untouched, the guard regex /^(\d+|gid:\/\/shopify\/Article\/\d+)$/ at shopifyGraphQlService.js:758 rejects it, and `throw new InvalidArticleIdError(id)` fires at :759 — the alerted stack frame `at getShopifyArticleById (/workspace/lib/services/shopifyGraphQlService.js:859:13)` (lib line, src :759). The function's own catch logs it at :889 (the 2 `[getShopifyArticleById] 8lGgNHsaWZhV1UYGUKAg … InvalidArticleIdError` entries at 07:16:03.905 and 07:16:06.904) and swallows it into `return {}` at :890, so the caller cannot tell 'bad id' from 'fetched article'. Back in getPreview, `article.isPublished` on `{}` is undefined → falsy → skips the published branch at :129 and fires `updateShopifyArticle({isPublished: true})` at :136; that call's userErrors are never inspected and it did not throw (no `[updateShopifyArticle]` entry in the window), so `didPublishForPreview = true` is set unconditionally at :137 even though nothing was published. The next statement reads `article.blog.handle` at :143 → `TypeError: Cannot read properties of undefined (reading 'handle')` — the 2 `[getPreview] … Error fetching the resource` entries at 07:16:04.081 and 07:16:07.047 — caught at the catch, logged, `ctx.status = 500` at :172 (the 2 request-log 500s). The `finally` at :178 then runs revertArticleToDraft, whose updateShopifyArticle returns `[{"field":["id"],"message":"Article does not exist"}]` on all 3 attempts (PREVIEW_REVERT_MAX_ATTEMPTS = 3), logging at :34 six times (2 requests × 3 attempts — the alert text for zfa04j), with 1s delays at :48, then the CRITICAL 'article left PUBLISHED' line at :52 twice, which is false: nothing was published and the id does not resolve. Per-request timeline matches exactly — request 1: 07:16:03.527 start → 03.905 InvalidArticleIdError → 04.081 TypeError → 04.241/05.415/06.561 revert attempts → 06.561 CRITICAL = 3.03s; request 2: 07:16:06.739 → 06.904 → 07.047 → 07.206/08.350/09.517 → 09.517 = 2.78s. The 2×1s delays plus 3 mutations account for ~2.3s of each ~2.8–3.0s failure.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:758` — guard regex ^(\d+|gid://shopify/Article/\d+)$ rejects the id this request sent
- `packages/functions/src/services/shopifyGraphQlService.js:759` — throw new InvalidArticleIdError(id) — the exact error name and message in both logged stacks
- `packages/functions/src/services/shopifyGraphQlService.js:889` — logger.error emitting the 2 [getShopifyArticleById] … InvalidArticleIdError entries, including the alerted one
- `packages/functions/src/services/shopifyGraphQlService.js:890` — return {} — root defect: swallows its own named error so the caller cannot distinguish an invalid id from a fetched article
- `packages/functions/src/controllers/appProxyController.js:124` — getPreview's getShopifyArticleById call — the frame named in both prod stacks (lib appProxyController.js:130)
- `packages/functions/src/controllers/appProxyController.js:129` — article.isPublished on {} is undefined → falls through to the publish path for an id that does not resolve
- `packages/functions/src/controllers/appProxyController.js:136` — publish mutation fired for the unresolvable id; its userErrors are never checked
- `packages/functions/src/controllers/appProxyController.js:137` — didPublishForPreview set true unconditionally, arming the revert path even though nothing was published
- `packages/functions/src/controllers/appProxyController.js:143` — article.blog.handle on {} throws the TypeError "reading 'handle'" that becomes the HTTP 500
- `packages/functions/src/controllers/appProxyController.js:172` — ctx.status = 500 — the 2 request-log 500s at 3.03s and 2.78s
- `packages/functions/src/controllers/appProxyController.js:178` — finally-block revert runs against an id Shopify cannot resolve
- `packages/functions/src/controllers/appProxyController.js:34` — the '[getPreview] revert userErrors … attempt=n/3' log — 6 occurrences in this window
- `packages/functions/src/controllers/appProxyController.js:48` — 1s delay between revert attempts — 2 per request, ~2s of each 2.8–3.0s failure
- `packages/functions/src/controllers/appProxyController.js:52` — CRITICAL 'article left PUBLISHED' fires even though nothing was published — a false page-worthy alert, 2 occurrences

## Evidence
- 2 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-09-27T07:01:27.207Z" AND timestamp<="2026-09-27T07:31:27.207Z" AND severity>=ERROR AND jsonPayload.error.name="InvalidArticleIdError"`
- 2 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-09-27T07:01:27.207Z" AND timestamp<="2026-09-27T07:31:27.207Z" AND severity>=ERROR AND jsonPayload.message:"reading 'handle'"`
- 6 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-09-27T07:01:27.207Z" AND timestamp<="2026-09-27T07:31:27.207Z" AND severity>=ERROR AND textPayload:"revert userErrors"`
- 2 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-09-27T07:01:27.207Z" AND timestamp<="2026-09-27T07:31:27.207Z" AND severity>=ERROR AND textPayload:"CRITICAL: article left PUBLISHED"`
- 2 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-09-27T07:01:27.207Z" AND timestamp<="2026-09-27T07:31:27.207Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $1.49

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
