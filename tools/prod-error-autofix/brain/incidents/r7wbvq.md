fingerprint: r7wbvq
service: api
message: [getShopifyArticles] 7RYMF2ui5bklQweeowOf TypeError: Cannot read properties of undefined (reading 'split')
app: BLOG
repo: blogs
date: 2026-08-12T10:14:59.071Z
status: mr_open
attempt: 1

# BLOG · api · r7wbvq

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/865

**Root cause.** GET /api/articles without an `order` query param makes articleController.list pass ctx.query straight into getShopifyArticles, and convertArticleQueryToQueryQL destructures `order` with no default, so `order.split(' ')` throws TypeError: Cannot read properties of undefined (reading 'split').

**Mechanism.** routes/api.js:85 mounts `router.get('/articles', articleController.list)`. list forwards the raw query object: `await getShopifyArticles({shop, query: ctx.query})` (articleController.js:726). getShopifyArticles calls `convertArticleQueryToQueryQL(query)` (shopifyService.js:273). That function destructures `{limit = 10, after, before, searchKey, order, status, ...}` (graphQLConvert.js:65-76) — every field has a default except `order` — then immediately runs `const [sortKey, direction] = order.split(' ')` (graphQLConvert.js:79). No caller on this path supplies a fallback: settingsController.js:44 and shopifyGraphQlService.js:2743 both hardcode an `order`, so only the ctx.query path can arrive with it undefined. The three alert occurrences map 1:1 onto three request logs, each `GET /api/articles?limit=100&page=1` (no `order`, userAgent Python-urllib/3.12): 02:34:40.833 + latency 0.3376s = 02:34:41.170 vs error at 02:34:41.170768; 02:34:56.683 + 0.7727s = 02:34:57.456 vs error at 02:34:57.454419; 02:35:07.989 + 0.3432s = 02:35:08.332 vs error at 02:35:08.333002. The four other /api/articles calls in the same two minutes all carried `order=UPDATED_AT+desc` and logged nothing. The throw is rethrown at shopifyService.js:367 and caught at articleController.js:772, which logs `[list] … Error in list:` and returns ctx.body `{success:false}` on HTTP 200 — which is why the requests read (httpRequest.status>=500) matched 0 entries while the request logs exist at 200.

Confidence: `high`

## Code
- `packages/functions/src/services/graphQLConvert.js:79` — const [sortKey, direction] = order.split(' ') — the throwing deref (prod lib graphQLConvert.js:63:38)
- `packages/functions/src/services/graphQLConvert.js:70` — `order` destructured with no default while limit/after/before/status all tolerate absence
- `packages/functions/src/services/shopifyService.js:273` — convertArticleQueryToQueryQL(query) — frame 2 of the stack, passes the caller's query untouched
- `packages/functions/src/controllers/articleController.js:726` — getShopifyArticles({shop, query: ctx.query}) — forwards the raw request query, the only caller that can omit order
- `packages/functions/src/routes/api.js:85` — router.get('/articles', articleController.list) — mounts the endpoint seen in the request logs
- `packages/functions/src/controllers/articleController.js:772` — logger.error('[list]', …, 'Error in list:', e.message) — emits the paired alert line and returns 200, explaining requests=0 under the status>=500 filter
- `packages/functions/src/controllers/settingsController.js:44` — other caller hardcodes order: 'UPDATED_AT desc' — cannot produce this error
- `packages/functions/src/services/shopifyGraphQlService.js:2743` — other caller hardcodes order: `PUBLISHED_AT ${sort}` — cannot produce this error

## Evidence
- 6 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-08-07T02:19:55.423Z" AND timestamp<="2026-08-07T02:49:55.423Z" AND severity>=ERROR`
- 9 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-08-07T02:34:00Z" AND timestamp<="2026-08-07T02:36:00Z" AND httpRequest.requestUrl:"article"`
- 8 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-07-13T00:00:00Z" AND timestamp<="2026-08-12T00:00:00Z" AND jsonPayload.error.stack:"convertArticleQueryToQueryQL"`

## Job
- analyze rounds: 1
- cost: $2.42
- branch: `fix/prod-blog-r7wbvq`
- fix commit: `5a15d34f2c6ab70fb2c0200d8ad9ae492c3d5c8c`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/865
- tests: 359 tests, 2 failing · baseline 2 failing · reproduce test fails without the fix

```
packages/functions/src/services/graphQLConvert.js | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
