fingerprint: 129mzed
service: api
message: [update] JwpKYI7R0mnPJFfRZdMM articleId: 622246625622 shopify userErrors after retry [{"field":["article","tags"],"message":"Article tags is invalid"}]
app: BLOG
repo: blogs
date: 2026-08-18T10:59:58.503Z
status: mr_open
attempt: 1

# BLOG · api · 129mzed

**Outcome.** duplicate of blfh15 — MR https://gitlab.com/avada/blogs/-/merge_requests/881

**Root cause.** The last 2 of 10 autosave PUTs on article 622246625622 sent a `tags` value Shopify rejected with userError field ["article","tags"] "Article tags is invalid"; the app forwards `tags` into ArticleUpdateInput with zero validation and handleRetryOnError has no branch for a tags userError, so the retry is a no-op and articleController.update answers HTTP 200 {success:false} — the merchant's edit is dropped silently with no 5xx.

**Mechanism.** 10:48:01–10:51:23Z, service `api` revision api-00140-lih: 10 PUT /api/article/622246625622?locale=&primary=en, every one HTTP 200, latency 1.16–1.67s (editor autosave, ~5–40s apart). The first 8 produced no error line. The 9th (execution yjkuo727fxss, request logged 10:50:51.073662Z) and the 10th (execution yjljrobu1n5e, request 10:51:23.597632Z) each logged the pair 'shopify userErrors' then 'shopify userErrors after retry' with the identical payload [{"field":["article","tags"],"message":"Article tags is invalid"}] — i.e. something changed in the tags field between 10:50:20 and 10:50:51 and every save after it failed. Path: articleController.update (articleController.js:565) → prepareGraphQLArticleData, which spreads the raw `tags` again at articlesHelper.js:106 AFTER cleanEmptyField already handled it at articlesHelper.js:96, so the later raw key wins and whatever the client sent (empty string, over-long tag, non-array) survives unchecked → updateShopifyArticle → updateArticlePrimary passes the object verbatim as `article: data` into ArticleUpdateInput (shopifyGraphQlService.js:1251). Shopify returns the userError; articleController.js:602 logs it, then calls handleRetryOnError (articleController.js:611). handleRetryOnError has exactly two branches — 'Must reference an existing blog.' (articlesHelper.js:175) and a userError whose field contains both 'article' and 'handle' (articlesHelper.js:190). This field is [article, tags], matching neither, so it falls through to `return {userErrors}` (articlesHelper.js:206) with no Shopify round trip at all — proven by the timestamps: the 'after retry' line lands 0.433 ms after the first (10:50:52.233555Z → .233988Z) and 0.174 ms in the second execution (10:51:24.842988Z → .843162Z), against a 1.16–1.24s request latency. articleController.js:628 then returns 200 {success:false}, which is why the requests read (status>=500) is empty. A GET on the same article at 10:57:48.524864Z follows — the merchant reloading onto the un-saved version. The exact rejected tag value cannot be recovered: the payload is never logged, so which tag Shopify called invalid (blank, >255 chars, or the 250-tag cap) is not established by these logs — only that the app forwarded it unvalidated and swallowed the rejection.

Confidence: `medium`

## Code
- `packages/functions/src/helpers/articlesHelper.js:106` — raw `tags` is spread a second time after cleanEmptyField, so the later key wins and any client value ('' , non-array, over-long tag) reaches Shopify unfiltered — no length/blank/count validation anywhere
- `packages/functions/src/helpers/articlesHelper.js:96` — the cleanEmptyField copy of `tags` — defeated by line 106, which is why an empty/invalid tags value is not stripped
- `packages/functions/src/helpers/articlesHelper.js:190` — handleRetryOnError's only update-path branch needs the userError field to contain both 'article' and 'handle'; this field is [article, tags]
- `packages/functions/src/helpers/articlesHelper.js:206` — falls through to returning the same userErrors with no Shopify call — the reason the 'after retry' log is byte-identical and 0.17–0.43 ms later
- `packages/functions/src/controllers/articleController.js:602` — first alerted log line: '[update] <shopId> articleId: <id> shopify userErrors'
- `packages/functions/src/controllers/articleController.js:611` — calls handleRetryOnError with the tags userError, which cannot handle it
- `packages/functions/src/controllers/articleController.js:625` — the exact alerted line, 'shopify userErrors after retry'
- `packages/functions/src/controllers/articleController.js:628` — returns 200 {success:false} — merchant's edit lost with no 5xx, matching the empty requests read
- `packages/functions/src/services/shopifyGraphQlService.js:1251` — prepared data, tags included, passed verbatim as `article: data` into ArticleUpdateInput

## Evidence
- 4 matching entries: `(resource.labels.service_name="api" OR resource.labels.service_name="apisa" OR resource.labels.service_name="apiv2") AND timestamp>="2026-08-11T00:00:00Z" AND timestamp<="2026-08-18T11:10:00Z" AND jsonPayload.message:"Article tags is invalid"`
- 12 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-08-18T10:36:05Z" AND timestamp<="2026-08-18T11:06:05Z" AND httpRequest.requestUrl:"/api/article/622246625622"`
- 4 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-08-18T10:49:00Z" AND timestamp<="2026-08-18T10:53:00Z" AND (labels.execution_id="yjkuo727fxss" OR labels.execution_id="yjljrobu1n5e")`

## Job
- analyze rounds: 2
- cost: $4.42
- MR: https://gitlab.com/avada/blogs/-/merge_requests/881

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
