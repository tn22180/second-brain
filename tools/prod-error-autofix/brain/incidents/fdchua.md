fingerprint: fdchua
service: api
message: [unhandledError] GET /api/article/629392670984 500 Response code 503 (Service Unavailable) HTTPError: Response code 503 (Service Unavailable)
app: BLOG
repo: blogs
date: 2026-08-14T02:17:01.469Z
status: mr_open
attempt: 1

# BLOG · api · fdchua

**Outcome.** duplicate of r2v3gh — MR https://gitlab.com/avada/blogs/-/merge_requests/878

**Root cause.** Duplicate of fingerprint r2v3gh (MR https://gitlab.com/avada/blogs/-/merge_requests/878 open, unmerged — line 210 is still outside the try block on this worktree): GET /api/article/629392670984 returned 500 because articleController.getOne issues the shopLocales Shopify Admin GraphQL query at line 210, outside its own try/catch and outside the shopifyRetryGraphQL wrapper, so Shopify's single transient HTTP 503 propagated out of the controller as an unhandled error.

**Mechanism.** getOne validates the id, loads the shop and builds a shopify-api-node client (articleController.js:206-208), then awaits shopLocalesGraphQL(shopify) at articleController.js:210 — one line above the try that opens at :212. shopLocalesGraphQL calls shopify.graphql(...) raw (shopLocalesGraphQL.js:8); the client is constructed with autoLimit:true only (shopifyService.js:26), which throttles rate limits and never retries 5xx, and got does not retry POST — so Shopify's 503 surfaced as `HTTPError: Response code 503 (Service Unavailable)`, code ERR_NON_2XX_3XX_RESPONSE, frame /workspace/node_modules/got/dist/source/as-promise/index.js:118. Because the throw happens before :212, the controller catch at :301 never ran (zero `[getOne]` lines in the 21 stderr entries of the window) and the retry wrapper never ran either (zero `[shopifyRetryGraphQL]` lines, which api.js:161 emits on every failure through makeGraphQlApi) — proving the failing call was a raw shopify.graphql outside both. Koa's errorHandler then wrote `[unhandledError] GET /api/article/629392670984 500` at 14:37:34.979Z (errorHandler.js:17) and errorService.handleError wrote `[handleError] Hm2xauzlnf8jVSV7doHp undefined` at 14:37:34.991Z (errorService.js:12), same execution_id rmh2ax8cq1nl. The identical shopLocales call inside getLocales (articleController.js:177) is wrapped and degrades to 200 {success:false} — the defect is call placement, not the query.

Confidence: `high`

## Code
- `packages/functions/src/controllers/articleController.js:210` — shopLocalesGraphQL awaited outside the try that opens at :212 — the only unguarded Shopify HTTP call on this request path, so the only line in getOne that can yield a 500
- `packages/functions/src/controllers/articleController.js:212` — try starts here; everything below returns 200 {success:false} via the catch at :301, which is why no [getOne] line was logged
- `packages/functions/src/helpers/graphql/shopLocalesGraphQL.js:8` — raw shopify.graphql() — bypasses makeGraphQlApi/shopifyRetryGraphQL, so a 503 gets no retry and emits no [shopifyRetryGraphQL] line
- `packages/functions/src/services/shopifyService.js:26` — shopify-api-node client built with autoLimit:true only — rate-limit throttling, no 5xx retry; got is its HTTP layer, matching the /workspace/node_modules/got frame
- `packages/functions/src/helpers/api.js:145` — RETRYABLE_STATUSES already contains 503 — the retry path that would have absorbed this failure exists and is simply not on this call path
- `packages/functions/src/controllers/articleController.js:177` — getLocales makes the identical shopLocales call inside try/catch and degrades to 200 {success:false} — contrast proving placement is the defect
- `packages/functions/src/middleware/errorHandler.js:17` — emits the [unhandledError] GET /api/article/629392670984 500 line seen at 14:37:34.979Z
- `packages/functions/src/services/errorService.js:12` — emits [handleError] <shopID> <shopifyDomain=undefined> — the alert text, shop Hm2xauzlnf8jVSV7doHp

## Evidence
- 2 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-13T14:22:54Z" AND timestamp<="2026-08-13T14:52:54Z" AND severity>=ERROR AND jsonPayload.error.code="ERR_NON_2XX_3XX_RESPONSE"`
- 2 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-13T00:00:00Z" AND timestamp<="2026-08-14T00:00:00Z" AND severity>=ERROR AND jsonPayload.error.code="ERR_NON_2XX_3XX_RESPONSE"`
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-13T00:00:00Z" AND timestamp<="2026-08-14T00:00:00Z" AND severity>=ERROR AND jsonPayload.tag="[unhandledError]"`
- 21 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-13T14:22:54.329Z" AND timestamp<="2026-08-13T14:52:54.329Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $1.08
- MR: https://gitlab.com/avada/blogs/-/merge_requests/878

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
