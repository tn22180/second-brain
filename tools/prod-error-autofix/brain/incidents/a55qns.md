fingerprint: a55qns
service: api
message: [updateArticlePrimary] 9efaeYnH2oXEGSpbu5bj <gid://shopify/Article/1000216232285> resp.errors [{"message":"The input array size of 371 is greater than the maximum allowed of 250.","locations":[{"line":2,"column":7}],"path":["articleUpdate","article","metafields","tags"],"extensions":{"code":"MAX_INP
app: BLOG
repo: blogs
date: 2026-09-21T21:28:01.142Z
status: fix_disabled
attempt: 1

# BLOG · api · a55qns

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** getShopifyArticleById's author-sync side effect writes the whole article back to Shopify via articleUpdate — including the article's own `tags` array read one line earlier — and this article carries 371 tags, above Shopify's hard 250-element cap on any GraphQL input list, so the mutation is rejected with MAX_INPUT_SIZE_EXCEEDED before execution and the author assignment is silently dropped.

**Mechanism.** The only request in flight on instance 0010dd860710649a8ba3f7… at 2026-09-21T21:20:20.928951Z was GET /api/article/1000216232285?primary=es (start 21:20:19.258965Z, latency 2.992087485s → ends 21:20:22.251Z); the other 11 entries on that instance all end before 21:20:20.93 or start after it. That request is articleController.getOne, which calls getShopifyArticleById (articleController.js:234). The read query selects the article's full `tags` list (shopifyGraphQlService.js:860). When the article's authorMetafield has no matching author row, the read path turns into a write: assignAuthorToArticle (line 901) or handleNewAuthor (line 954) calls prepareGraphQLArticleData(article) and re-sends the entire article, and prepareGraphQLArticleData passes `tags` straight through with no cap (articlesHelper.js:108). Because the failing request is a GET with no body, the 371-element array cannot have come from a client payload — it is the article's own tag list, read back out of Shopify and posted straight in. Shopify validates the document before execution — `locations:[{line:2,column:7}]` is exactly `      articleUpdate(` on line 2 of the mutation string at shopifyGraphQlService.js:1233 — and rejects it with MAX_INPUT_SIZE_EXCEEDED, 371 > 250. updateArticlePrimary then logs and RETURNS `{userErrors: resp.errors}` instead of throwing (line 1253), so assignAuthorToArticle's try/catch never fires and neither caller inspects userErrors: the author write is lost, getOne answers 200, and exactly one log line exists for the whole failure — which is what the window shows (errors=1, no `[update]`/`[assignAuthorToArticle]` companion line). Which of the two author branches fired cannot be distinguished from the logs; both take the same payload path.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyGraphQlService.js:860` — the read query selects the article's full `tags` list — the source of the 371 entries, since the failing request was a GET with no body
- `packages/functions/src/services/shopifyGraphQlService.js:901` — assignAuthorToArticle turns a read into a full-article articleUpdate via prepareGraphQLArticleData(article); only catches throws, never checks the returned userErrors
- `packages/functions/src/services/shopifyGraphQlService.js:954` — handleNewAuthor does the same full-article re-write; the other branch that can fire from the same read
- `packages/functions/src/helpers/articlesHelper.js:108` — prepareGraphQLArticleData passes `tags` through verbatim with no 250-element cap and no dedupe
- `packages/functions/src/services/shopifyGraphQlService.js:1233` — the articleUpdate mutation whose line 2 / column 7 matches the `locations` Shopify reported
- `packages/functions/src/services/shopifyGraphQlService.js:1253` — returns {userErrors: resp.errors} instead of throwing, so the author-sync callers' try/catch cannot see the failure — explains the single orphan log line
- `packages/functions/src/controllers/articleController.js:234` — getOne's call into getShopifyArticleById — the GET /api/article/1000216232285?primary=es that was in flight at the error timestamp

## Evidence
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-21T21:05:39.534Z" AND timestamp<="2026-09-21T21:35:39.534Z" AND severity>=ERROR`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-14T00:00:00Z" AND "maximum allowed of 250"`
- 12 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-21T21:19:00Z" AND timestamp<="2026-09-21T21:21:00Z" AND labels.instanceId="0010dd860710649a8ba3f72c5f87c6c13f576ad5514b9a318b86023bdc9d08385f1cea5fadc301564b1b02584d225878496f5d937e9fb0516c9b1bc7be835cebb09556d04d23dcb128a1b5733ebd03"`
- 1 matching entries: `resource.labels.project_id="avada-blog-app" AND labels.execution_id="br1bgiqv61fu"`

## Job
- analyze rounds: 1
- cost: $4.70

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
