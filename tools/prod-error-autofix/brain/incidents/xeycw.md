fingerprint: xeycw
service: api
message: [update] oU1eLddMkUdpnYAYISPu articleId: 28987719791 update error RequestError: There was a problem loading this website. Please try again.
app: BLOG
repo: blogs
date: 2026-08-16T17:28:21.458Z
status: mr_open
attempt: 1

# BLOG · api · xeycw

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/886

**Root cause.** PUT /api/article/28987719791 for shop oU1eLddMkUdpnYAYISPu failed because the unretried shopLocales Shopify Admin GraphQL call at articleController.update (articleController.js:568) got a transient Shopify edge error body ("There was a problem loading this website. Please try again."), and since that call is awaited before the update fan-out, the whole save aborted into update's catch.

**Mechanism.** The single ERROR line in the window is tag [update] carrying jsonPayload.error.code=ERR_GOT_REQUEST_ERROR with frames got/as-promise/index.js -> shopify-api-node maybeError. maybeError only runs on shopify-api-node's own got client, i.e. a shopify.graphql() call; makeGraphQlApi goes through axios (helpers/api.js:126) and could never produce a got frame, so updateArticlePrimary (shopifyGraphQlService.js:1255) is excluded. Inside update, every other member of the Promise.all is Firestore or axios: getLastVersion (articleRepository.js:71), upsertTrashArticle, upsertRelatedKeywords, upsertReport, logPublishBlogEvent (eventLogService.js:56), seoProxyApi. updateShopifyArticle wraps its own body in try/catch and logs tag [updateShopifyArticle] at logger.error (shopifyGraphQlService.js:1192) — no such line exists in the window, where the ERROR count is exactly 1. That leaves one got-capable call: shopLocalesGraphQL(shopify) at articleController.js:568, a bare shopify.graphql (shopLocalesGraphQL.js:8) on a client built with no timeout and no retry (shopifyService.js:26), outside shopifyRetryGraphQL (helpers/api.js:154). Shopify answered it with an error body, got rejected, and update's catch (articleController.js:654) logged the alert and returned {success:false} at HTTP 200 — which is why the requests read (httpRequest.status>=500) is empty and why round 1's 5xx query matched nothing.

Confidence: `medium`

## Code
- `packages/functions/src/controllers/articleController.js:568` — the shopLocales call, awaited before the update fan-out, with no retry wrapper — the only got/shopify-api-node call in update outside updateShopifyArticle's own try
- `packages/functions/src/helpers/graphql/shopLocalesGraphQL.js:8` — bare shopify.graphql(); a single transient Shopify error rejects it, no retry, no timeout
- `packages/functions/src/services/shopifyService.js:26` — initShopify builds shopify-api-node with only autoLimit — no timeout, no retry; this is the got client whose maybeError produced the alert
- `packages/functions/src/helpers/api.js:154` — shopifyRetryGraphQL retries 429/500/502/503/504/520 — the path shopLocalesGraphQL bypasses
- `packages/functions/src/services/shopifyGraphQlService.js:1255` — updateArticlePrimary goes through makeGraphQlApi (axios), so it cannot emit a got RequestError — excludes the mutation as the source
- `packages/functions/src/services/shopifyGraphQlService.js:1192` — updateShopifyArticle's catch logs tag [updateShopifyArticle] at logger.error; that tag is absent from the window's single ERROR entry
- `packages/functions/src/controllers/articleController.js:654` — the catch that emitted the alert; returns 200 {success:false}, which is why the httpRequest.status>=500 read is empty

## Evidence
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-16T16:29:53.142Z" AND timestamp<="2026-08-16T16:59:53.142Z" AND severity>=ERROR`
- 5 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-09T00:00:00Z" AND timestamp<="2026-08-17T00:00:00Z" AND severity>=ERROR AND jsonPayload.error.code="ERR_GOT_REQUEST_ERROR"`
- 4 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-09T00:00:00Z" AND timestamp<="2026-08-17T00:00:00Z" AND jsonPayload.tag="[shopifyRetryGraphQL]"`

## Job
- analyze rounds: 2
- cost: $6.40
- branch: `fix/prod-blog-xeycw`
- fix commit: `cf5aa7be2481aef444ee0f8bec1482a35a95df1b`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/886
- tests: 386 tests, 2 failing · baseline 2 failing · reproduce test fails without the fix

```
.../src/controllers/appProxyController.js          |  4 +--
 .../functions/src/controllers/articleController.js | 23 ++++++++++----
 .../src/handlers/pubsub/subscribeImportArticles.js |  2 +-
 .../src/helpers/graphql/shopLocalesGraphQL.js      | 35 ++++++++++++++--------
 .../functions/src/services/genAIBlogService.js     |  6 ++--
 5 files changed, 43 insertions(+), 27 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
