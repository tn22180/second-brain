fingerprint: 1xbqtjr
service: api
message: [list] 7RYMF2ui5bklQweeowOf Error in list: Cannot read properties of undefined (reading 'split')
app: BLOG
repo: blogs
date: 2026-08-12T10:16:24.014Z
status: mr_open
attempt: 1

# BLOG · api · 1xbqtjr

**Outcome.** duplicate of r7wbvq — MR https://gitlab.com/avada/blogs/-/merge_requests/865

**Root cause.** Duplicate of fingerprint r7wbvq (MR https://gitlab.com/avada/blogs/-/merge_requests/865 open, unmerged — same shop 7RYMF2ui5bklQweeowOf, same 3 occurrences in the same 02:34–02:35Z window): GET /api/articles without an `order` query param makes articleController.list forward ctx.query into getShopifyArticles, and convertArticleQueryToQueryQL destructures `order` with no default, so `order.split(' ')` throws TypeError: Cannot read properties of undefined (reading 'split').

**Mechanism.** routes/api.js:85 mounts `router.get('/articles', articleController.list)`. list forwards the raw query object untouched: `await getShopifyArticles({shop, query: ctx.query})` (articleController.js:726). getShopifyArticles calls `convertArticleQueryToQueryQL(query)` (shopifyService.js:273 — prod frame `lib/services/shopifyService.js:349:70`). That function destructures `{limit = 10, after, before, searchKey, order, status, tag, blog, author, publishedAtMin, publishedAtMax}` (graphQLConvert.js:65-76) — every consumed field tolerates absence except `order` — then immediately runs `const [sortKey, direction] = order.split(' ')` (graphQLConvert.js:79, prod frame `lib/services/graphQLConvert.js:63:38`). The other two callers hardcode an order (settingsController.js:44 `'UPDATED_AT desc'`, shopifyGraphQlService.js:2743 `PUBLISHED_AT ${sort}`), so only the ctx.query path can arrive with it undefined. The throw is rethrown at shopifyService.js:367 (`logger.error('[getShopifyArticles]', shop.id, e)`) and caught at articleController.js:772, which logs the paired `[list] … Error in list:` line and returns HTTP 200 with `{success:false}` — which is why the requests read (httpRequest.status>=500) matched 0 entries while the error lines exist. The 6 ERROR entries in the window are exactly 3 stack pairs, all shop 7RYMF2ui5bklQweeowOf, spanIds 14181826745654361631 / 8505955380579739724 / 5434289431493289900, at 02:34:41.170768, 02:34:57.454419, 02:35:08.333002 — matching the alert's 3 occurrences. The remaining 19 stderr entries in the window are unrelated (Firestore 16 UNAUTHENTICATED from eventLogService, pattern P6, and one getCrmWidgets 400).

Confidence: `high`

## Code
- `packages/functions/src/services/graphQLConvert.js:79` — const [sortKey, direction] = order.split(' ') — the throwing deref, prod frame lib/services/graphQLConvert.js:63:38
- `packages/functions/src/services/graphQLConvert.js:70` — `order` destructured with no default while limit/after/before/status/tag all tolerate absence
- `packages/functions/src/services/shopifyService.js:273` — convertArticleQueryToQueryQL(query) — frame 2 of the stack, passes the caller's query untouched
- `packages/functions/src/services/shopifyService.js:367` — logger.error('[getShopifyArticles]', shop.id, e) then rethrow — emits the stack-carrying alert line
- `packages/functions/src/controllers/articleController.js:726` — getShopifyArticles({shop, query: ctx.query}) — forwards the raw request query, the only caller that can omit order
- `packages/functions/src/controllers/articleController.js:772` — logger.error('[list]', …, 'Error in list:', e.message) then ctx.body {success:false} on HTTP 200 — explains requests=0 under the status>=500 filter
- `packages/functions/src/routes/api.js:85` — router.get('/articles', articleController.list) — mounts the endpoint
- `packages/functions/src/controllers/settingsController.js:44` — other caller hardcodes order: 'UPDATED_AT desc' — cannot produce this error

## Evidence
- 6 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-08-07T02:19:58.538Z" AND timestamp<="2026-08-07T02:49:58.538Z" AND severity>=ERROR`
- 3 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-08-07T02:19:58.538Z" AND timestamp<="2026-08-07T02:49:58.538Z" AND jsonPayload.error.stack:"convertArticleQueryToQueryQL"`
- 8 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-07-13T00:00:00Z" AND timestamp<="2026-08-12T00:00:00Z" AND jsonPayload.error.stack:"convertArticleQueryToQueryQL"`

## Job
- analyze rounds: 1
- cost: $1.14
- MR: https://gitlab.com/avada/blogs/-/merge_requests/865

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
