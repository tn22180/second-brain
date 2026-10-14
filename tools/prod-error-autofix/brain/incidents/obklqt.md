fingerprint: obklqt
service: api
message: [update] zWg686IsFgCAjIs18mIl articleId: 599271440624 update error RequestError: read ECONNRESET
app: BLOG
repo: blogs
date: 2026-10-14T00:51:19.872Z
status: fix_disabled
attempt: 1

# BLOG · api · obklqt

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** The `shopLocalesGraphQL(shopify)` call in articleController.update goes through shopify-api-node's got client, which has no retry and no timeout configured, so one transient TLS socket reset on the Shopify Admin endpoint aborts the whole article save — unlike every other Admin call in update(), which goes through makeGraphQlApi's shopifyRetryGraphQL where ECONNRESET is already a retryable code.

**Mechanism.** The alert's stack is got (`/workspace/node_modules/got/dist/source/core/index.js:970`, `@szmarczak/http-timer`), not axios, so it did not come from `helpers/api.js`'s axios client — it came from a `shopify.graphql(...)` call on the `shopify-api-node@3.15.0` client built by `initShopify` (shopifyService.js:27), which passes only `apiVersion/accessToken/shopName/autoLimit` and no `timeout`. Execution 7dlyzl3yu3ii emitted exactly ONE log line for the whole request — the `[update]` catch at articleController.js:734. That single-line fact eliminates every other candidate inside update(): a throw from `updateShopifyArticle` would have logged `[updateShopifyArticle]` first (shopifyGraphQlService.js:1192 re-raises after logging), a throw from any `makeGraphQlApi` path would have logged `[shopifyRetryGraphQL]` (api.js:161 logs on every attempt before deciding to retry), and `seoProxyApi` swallows its own errors (api.js:98-106). `getShopById`, `getLastVersion`, `upsertTrashArticle` and `upsertRelatedKeywords` are Firestore, which cannot produce a got/TLSSocket stack. The only HTTP call left in update() that is awaited bare with no inner catch and no retry wrapper is `const {shopLocales} = await shopLocalesGraphQL(shopify)` at articleController.js:611, whose body is a single `await shopify.graphql(...)` (shopLocalesGraphQL.js:8). Shopify Admin reset the TLS socket mid-read; got does not retry it because `graphql()` issues a POST and got's default retry only covers idempotent methods, so the RequestError propagated to the outer catch and the merchant's save returned `{success: false}` with the article unsaved. Frequency: 2 ECONNRESET lines in 24h on `api` — this one, and one at 2026-10-13T21:00:09 tagged `[shopifyRetryGraphQL]`, i.e. the same network condition hitting the axios path where it WAS retried and recovered. That contrast is the finding: `RETRYABLE_CODES` at api.js:138 already lists `'ECONNRESET'`, but nothing on the `shopify.graphql` path consults it. Over the last 7 days this is the only `[update] … update error`, so the trigger is transient, not a regression; the defect is the missing retry, not the reset itself. Scope note: the same unretried call exists at six other call sites (articleController.js:171 and :224, appProxyController.js:122, genAIBlogService.js:78 and :176, subscribeImportArticles.js:67), so fixing only update() leaves the family live — the same lesson as pattern P2.

Confidence: `medium`

## Code
- `packages/functions/src/controllers/articleController.js:611` — `await shopLocalesGraphQL(shopify)` — the only bare, unwrapped HTTP call in update(); by elimination the origin of the got ECONNRESET
- `packages/functions/src/helpers/graphql/shopLocalesGraphQL.js:8` — `return await shopify.graphql(...)` — shopify-api-node/got call with no retry, no timeout, no catch
- `packages/functions/src/services/shopifyService.js:27` — `new Shopify({apiVersion, accessToken, shopName, autoLimit: true})` — no `timeout` option, so the got client has no application-side deadline
- `packages/functions/src/helpers/api.js:138` — `'ECONNRESET'` is already in RETRYABLE_CODES — the repo's own convention, which the shopify.graphql path never reaches
- `packages/functions/src/helpers/api.js:161` — `logger.error('[shopifyRetryGraphQL]', e)` fires on every attempt; its absence in execution 7dlyzl3yu3ii rules out the makeGraphQlApi path
- `packages/functions/src/services/shopifyGraphQlService.js:1192` — `logger.error('[updateShopifyArticle]', ...)` before rethrow; its absence rules out updateShopifyArticle as the thrower
- `packages/functions/src/controllers/articleController.js:734` — the `[update]` catch that produced the alert — the single log line of the whole failed request

## Evidence
- 1 matching entries: `resource.labels.service_name="api" AND labels.execution_id="7dlyzl3yu3ii"`
- 2 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-10-13T00:48:00Z" AND timestamp<="2026-10-14T00:48:08Z" AND jsonPayload.message:"ECONNRESET"`
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-10-07T00:00:00Z" AND jsonPayload.tag="[update]" AND jsonPayload.message:"update error"`
- 4 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api" OR resource.labels.job_name="api") AND timestamp>="2026-10-14T00:18:08.526Z" AND timestamp<="2026-10-14T00:48:08.526Z" AND logName:"stderr"`

## Job
- analyze rounds: 2
- cost: $3.20

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
