fingerprint: 1xb20gb
service: proxy
message: [getPreview] CRITICAL: article left PUBLISHED after preview, manual unpublish required <http://d169f2-a1.myshopify.com|d169f2-a1.myshopify.com> articleId=PII_REMOVED_83E9B775F636F392C39E9D8882B7ECF1
app: BLOG
repo: blogs
date: 2026-10-12T13:33:24.319Z
status: fix_disabled
attempt: 2

# BLOG · proxy · 1xb20gb

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** getShopifyArticleById swallows its own InvalidArticleIdError and returns `{}`, so getPreview treats a non-resolvable `id` as an unpublished article: it fires the publish mutation (which Shopify rejects with userErrors `Article does not exist`), sets `didPublishForPreview = true` without checking those userErrors, then crashes on `article.blog.handle` — so the finally block retries an unpublish of an article that was never published and emits a false-positive CRITICAL alert.

**Mechanism.** 2/2 `GET /proxy/seoOn-preview?...id=<redacted>` requests (13:28:55.514, 13:28:59.004, both 500, 2.85s/2.96s, same `noCache=43ca35c4-97fb-4f5f-bff3-9722a4d380b2`) produced the identical 6-line cascade on revision proxy-00186-viw, shop d169f2-a1.myshopify.com / shopId 8lGgNHsaWZhV1UYGUKAg: (1) `id` is present but fails the `/^(\d+|gid:\/\/shopify\/Article\/\d+)$/` guard at shopifyGraphQlService.js:759, so `InvalidArticleIdError` is thrown at :760 — logged with tag `[getShopifyArticleById]` at 13:28:55.800 and 13:28:59.169; (2) the function's own catch at :889-891 logs and `return {}`, so getPreview (appProxyController.js:124) receives `{}` instead of an exception; (3) `article.isPublished` is undefined → falsy, so the published-article early return at :129 is skipped; (4) :136 calls `updateShopifyArticle({id, data:{isPublished:true}})`, which goes through `toArticleGid` (:1098, no validation) and returns `resp.data.articleUpdate` with `userErrors:[{"field":["id"],"message":"Article does not exist"}]` rather than throwing (updateArticlePrimary :1250-1257) — nothing was published; (5) :137 sets `didPublishForPreview = true` unconditionally, ignoring that return value; (6) :143 reads `article.blog.handle` on `{}` → `TypeError: Cannot read properties of undefined (reading 'handle')`, logged at 13:28:55.960 and 13:28:59.345, caught at :170 → `ctx.status = 500`; (7) the `finally` at :178 runs revertArticleToDraft, whose 3 attempts each get the same `Article does not exist` userErrors (6 log lines, 13:28:56.136 → 13:29:01.861, ~1.17s apart = PREVIEW_REVERT_RETRY_DELAY_MS 1000ms) and then logs the alerting CRITICAL line at :51-55. The CRITICAL message is therefore wrong: no manual unpublish is required because the publish at :136 never took effect.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:760` — throw new InvalidArticleIdError(id) — the first log line of each cascade; `id` present but not numeric/gid
- `packages/functions/src/services/shopifyGraphQlService.js:891` — catch returns `{}` instead of rethrowing, so the caller cannot tell a bad id from a valid article
- `packages/functions/src/controllers/appProxyController.js:124` — getPreview assigns that `{}` to `article` and never checks it
- `packages/functions/src/controllers/appProxyController.js:129` — `article.isPublished` undefined on `{}` → falsy → falls through to the publish path
- `packages/functions/src/controllers/appProxyController.js:136` — publish mutation whose return value (userErrors `Article does not exist`) is discarded
- `packages/functions/src/controllers/appProxyController.js:137` — `didPublishForPreview = true` set unconditionally — the direct cause of the false-positive CRITICAL alert
- `packages/functions/src/controllers/appProxyController.js:143` — `article.blog.handle` on `{}` throws the TypeError that produces the HTTP 500
- `packages/functions/src/controllers/appProxyController.js:178` — finally triggers revertArticleToDraft for an article that was never published
- `packages/functions/src/controllers/appProxyController.js:51` — the CRITICAL log line this alert fingerprints, reached after 3 doomed revert attempts
- `packages/functions/src/services/shopifyGraphQlService.js:1257` — updateArticlePrimary returns userErrors in the payload instead of throwing, so callers that ignore the return value see a silent no-op
- `packages/functions/src/services/shopifyGraphQlService.js:1098` — toArticleGid applies no id validation, so the invalid id is sent to Shopify as a gid

## Evidence
- 2 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-10-12T13:14:17Z" AND timestamp<="2026-10-12T13:44:17Z" AND jsonPayload.tag="[getShopifyArticleById]"`
- 2 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-10-12T13:14:17Z" AND timestamp<="2026-10-12T13:44:17Z" AND jsonPayload.tag="[getPreview]"`
- 6 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-10-12T13:14:17Z" AND timestamp<="2026-10-12T13:44:17Z" AND textPayload:"revert userErrors"`
- 2 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-10-12T13:14:17Z" AND timestamp<="2026-10-12T13:44:17Z" AND textPayload:"CRITICAL: article left PUBLISHED"`
- 2 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-10-12T13:14:17.592Z" AND timestamp<="2026-10-12T13:44:17.592Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $1.26

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
