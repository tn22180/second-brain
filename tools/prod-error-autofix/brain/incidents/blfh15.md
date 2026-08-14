fingerprint: blfh15
service: api
message: [update] lGFvPaSOKCGOsGrvYOXi articleId: 630025421087 shopify userErrors [{"field":["article","metafields","5","key"],"message":"Key must be unique within this namespace on this resource"}]
app: BLOG
repo: blogs
date: 2026-08-14T07:12:03.331Z
status: mr_open
attempt: 1

# BLOG · api · blfh15

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/881

**Root cause.** PUT /api/article/630025421087 for shop lGFvPaSOKCGOsGrvYOXi fails deterministically because the articleUpdate nested `metafields` input addresses metafields by namespace+key with no `id` (and a `type` fallback of the legacy value 'string'), so Shopify cannot upsert the entry at index 5 — that namespace+key already exists on the article — and answers `Key must be unique within this namespace on this resource`; handleRetryOnError has no branch for metafield userErrors, so the retry re-sends the identical payload and fails identically.

**Mechanism.** articleController.update builds the payload with prepareGraphQLArticleData (packages/functions/src/helpers/articlesHelper.js:19), whose metafields array (articlesHelper.js:68-78) emits at most one entry per key and never carries an `id` — removed deliberately in 244772f18 (2026-08-06), with `type: metafield.type || 'string'` added in f7130eb56 (2026-08-07) at articlesHelper.js:63. That array is sent as `article.metafields` to the `articleUpdate` mutation (packages/functions/src/services/shopifyGraphQlService.js:1238). The nine keys in the array are distinct literals, so the reported collision at `["article","metafields","5","key"]` cannot be a duplicate inside the payload — it is against a metafield already stored on the article, i.e. Shopify treated the id-less entry as a create instead of an upsert. updateArticlePrimary returns `articleUpdate.userErrors` to articleController.js:601, which logs the alert line (articleController.js:602-609) and calls handleRetryOnError (articleController.js:611). handleRetryOnError only branches on 'Must reference an existing blog.' and on article+handle errors (articlesHelper.js:187-204); a metafield error falls through to `return {userErrors}` (articlesHelper.js:206), which is why the 'after retry' line is byte-identical to the pre-retry line in all four log entries and no second Shopify call was made. update then answers HTTP 200 with `{success:false}` (articleController.js:628), which is why the requests read (httpRequest.status>=500) is empty for the window.

Confidence: `medium`

## Code
- `packages/functions/src/helpers/articlesHelper.js:68` — metafields array sent to articleUpdate; nine distinct keys, so index 5 cannot be an intra-payload duplicate
- `packages/functions/src/helpers/articlesHelper.js:63` — type fallback is legacy 'string' and no `id` is emitted — the entry cannot upsert an existing metafield
- `packages/functions/src/helpers/articlesHelper.js:206` — handleRetryOnError falls through to `return {userErrors}` for metafield errors — retry is a no-op, explains the identical 'after retry' log
- `packages/functions/src/controllers/articleController.js:602` — emits the alerted `[update] ... shopify userErrors` line
- `packages/functions/src/controllers/articleController.js:620` — emits the identical `... after retry` line 0.4ms later
- `packages/functions/src/controllers/articleController.js:628` — returns HTTP 200 {success:false}, so the failure never appears in the requests read
- `packages/functions/src/services/shopifyGraphQlService.js:1238` — the articleUpdate mutation whose `article.metafields` input produced the field path

## Evidence
- 4 matching entries: `timestamp>="2026-08-06T00:00:00Z" AND timestamp<="2026-08-14T06:00:00Z" AND jsonPayload.message:"Key must be unique within this namespace"`
- 4 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-08-14T04:15:47.346Z" AND timestamp<="2026-08-14T04:45:47.346Z" AND jsonPayload.message:"articleId: 630025421087"`
- 7 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-14T04:15:47.346Z" AND timestamp<="2026-08-14T04:45:47.346Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $6.38
- branch: `fix/prod-blog-blfh15`
- fix commit: `946b807cef7e0e82ab171948373493fc22fb81d5`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/881
- tests: 386 tests, 2 failing · baseline 2 failing · reproduce test fails without the fix

```
.../__tests__/articlesHelper.metafields.test.js    |  2 +-
 packages/functions/src/helpers/articlesHelper.js   | 35 +++++++++++++++++++++-
 .../src/services/shopifyGraphQlService.js          | 30 +++++++++++++++----
 3 files changed, 59 insertions(+), 8 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
