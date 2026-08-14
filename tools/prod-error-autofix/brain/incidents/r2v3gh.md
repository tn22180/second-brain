fingerprint: r2v3gh
service: api
message: [handleError] Hm2xauzlnf8jVSV7doHp undefined HTTPError: Response code 503 (Service Unavailable)
app: BLOG
repo: blogs
date: 2026-08-14T02:15:22.576Z
status: mr_open
attempt: 1

# BLOG · api · r2v3gh

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/878

**Root cause.** GET /api/article/629392670984 returned 500 because articleController.getOne issues the shopLocales Shopify Admin GraphQL query at line 210 — outside its own try/catch and outside the shopifyRetryGraphQL wrapper — so Shopify's single transient HTTP 503 propagated out of the controller as an unhandled error.

**Mechanism.** getOne validates the id, loads the shop and builds a shopify-api-node client (articleController.js:206-208), then awaits shopLocalesGraphQL(shopify) at articleController.js:210, one line above the try block that starts at :212. shopLocalesGraphQL calls shopify.graphql(...) directly (shopLocalesGraphQL.js:8); shopify-api-node is constructed with only autoLimit:true (shopifyService.js:26), which throttles rate limits and does not retry 5xx, and got does not retry POST by default — so Shopify's 503 surfaces as `HTTPError: Response code 503 (Service Unavailable)` with code ERR_NON_2XX_3XX_RESPONSE from /workspace/node_modules/got/dist/source/as-promise/index.js:118. Because the throw happens before :212, the controller's catch at :301 never runs (no `[getOne]` log line exists anywhere in the window) and the retry wrapper never runs either (no `[shopifyRetryGraphQL]` line, which api.js:161 emits on every failure through makeGraphQlApi) — proving the failing call was a raw shopify.graphql outside both. Koa's errorHandler then logged `[unhandledError] GET /api/article/629392670984 500` (errorHandler.js:17) and errorService.handleError logged the shop id (errorService.js:12). The same call wrapped correctly in getLocales (articleController.js:177) returns 200 {success:false} instead.

Confidence: `high`

## Code
- `packages/functions/src/controllers/articleController.js:210` — shopLocalesGraphQL awaited outside the try block that opens at :212 — the only unguarded Shopify HTTP call on this request path, so it is the only line in getOne that can yield a 500
- `packages/functions/src/controllers/articleController.js:212` — try block starts here; everything below returns 200 with {success:false} via the catch at :301, which is why no [getOne] error line was logged
- `packages/functions/src/helpers/graphql/shopLocalesGraphQL.js:8` — raw shopify.graphql() — bypasses makeGraphQlApi/shopifyRetryGraphQL entirely, so a 503 gets no retry and no [shopifyRetryGraphQL] log
- `packages/functions/src/services/shopifyService.js:26` — the shopify-api-node client is built with autoLimit:true only — rate-limit throttling, no 5xx retry; got is its HTTP layer, matching the /workspace/node_modules/got frame in the stack
- `packages/functions/src/helpers/api.js:145` — RETRYABLE_STATUSES already contains 503 — the retry path that would have absorbed this failure exists and is simply not on this call path
- `packages/functions/src/controllers/articleController.js:177` — getLocales makes the identical shopLocales call inside a try/catch and degrades to 200 {success:false} — the contrast showing the defect in getOne is call placement, not the query
- `packages/functions/src/middleware/errorHandler.js:17` — emits the [unhandledError] GET /api/article/629392670984 500 line seen at 14:37:34.979Z
- `packages/functions/src/services/errorService.js:12` — emits [handleError] <shopID> <shopifyDomain=undefined> — the alert text, shop Hm2xauzlnf8jVSV7doHp

## Evidence
- 2 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-13T14:22:54Z" AND timestamp<="2026-08-13T14:52:54Z" AND severity>=ERROR AND jsonPayload.error.code="ERR_NON_2XX_3XX_RESPONSE"`
- 2 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-13T00:00:00Z" AND timestamp<="2026-08-14T00:00:00Z" AND severity>=ERROR AND jsonPayload.error.code="ERR_NON_2XX_3XX_RESPONSE"`
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-13T00:00:00Z" AND timestamp<="2026-08-14T00:00:00Z" AND severity>=ERROR AND jsonPayload.tag="[unhandledError]"`
- 21 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-13T14:22:54.055Z" AND timestamp<="2026-08-13T14:52:54.055Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $4.05
- branch: `fix/prod-blog-r2v3gh`
- fix commit: `4d4bf213cd630128b2e8c067fe1986101f1647f2`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/878
- tests: 367 tests, 2 failing · baseline 2 failing · reproduce test fails without the fix

```
packages/functions/src/controllers/articleController.js      |  2 +-
 packages/functions/src/helpers/api.js                        |  6 ++++--
 packages/functions/src/helpers/graphql/shopLocalesGraphQL.js | 10 ++++++++--
 3 files changed, 13 insertions(+), 5 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
