fingerprint: ixc1eq
service: api
message: [shopifyRetryGraphQL] Error: read ECONNRESET
app: BLOG
repo: blogs
date: 2026-07-31T10:26:57.224Z
status: mr_open
attempt: 1

# BLOG · api · ixc1eq

**Outcome.** duplicate of 1w64e0z — MR https://gitlab.com/avada/blogs/-/merge_requests/810

**Root cause.** Duplicate of fingerprint 1w64e0z (MR 810 already open, unmerged): shopifyRetryGraphQL decides retryability with `[502, 503, 520].includes(e.statusCode)`, a field axios 0.27 never sets, so the transient TLS `read ECONNRESET` on the Shopify Admin GraphQL socket was rethrown on attempt 1 of 5 instead of being retried, killing PUT /api/article/570605142187.

**Mechanism.** The alert line is `[shopifyRetryGraphQL] Error: read ECONNRESET` at 2026-07-31T09:34:14.088931Z on revision api-00106-zej — the exact same log entry already triaged as 1w64e0z, refingerprinted on the `[shopifyRetryGraphQL]` tag instead of the `[updateShopifyArticle]` tag 0.28ms later. At 09:34:14 the instance's egress dropped several long-lived sockets at once: [seoProxyApi] krq0hv-kn.myshopify.com POST /updateOvrList logged `read ECONNRESET` at .087973, the Shopify GraphQL socket at .088931, and 10 `Exception from a finished function: Error: read ECONNRESET` fired in the window (09:29:29–09:34:14), alongside three Memorystore 10.68.191.235 ioredis resets at 09:31:08/09:31:09/09:35:23. The Shopify one was thrown inside `api()` (packages/functions/src/helpers/api.js:20), a bare `axios.create()` client with no interceptors, so the rejected value is an axios 0.27 error carrying `code:'ECONNRESET'` and `response: undefined` — it has no `statusCode` property at all. shopifyRetryGraphQL caught it, logged it (api.js:141 — the alert), evaluated `[502,503,520].includes(e.statusCode)` against `undefined` → false (api.js:143), and took `throw new Error(e)` (api.js:145) on attempt 1. That double-wrap is why the callers report `Error: Error: read ECONNRESET` and why `e.code` is gone downstream. Proof no retry ran: exactly 1 `[shopifyRetryGraphQL]` entry exists in the full 24h window, and the caller error at 09:34:14.089211 is 0.28ms later — a retry needs `delay((attempt + Math.random()) * 1000)` ≥ 1s plus a second log line. The rejection propagated updateArticlePrimary's `await makeGraphQlApi` (shopifyGraphQlService.js:1238) → updateShopifyArticle's catch (shopifyGraphQlService.js:1175, rethrows) → the `Promise.all` in articleController.update (articleController.js:551), which answered 200 `{success:false}` — the merchant's save silently failed. Same predicate is also wrong for the statuses it names: axios puts those at `e.response.status`, never `e.statusCode`, so `maxRetries: 5` has never fired for any error class and the retry loop is dead code. Not this alert's cause but present in the same window: 18 of 21 5xx are 504s at exactly 539.947s against the function's `timeoutSeconds: 540` (P4), plus 5 `CompletionTruncatedError` (P1, already covered by MR 809) and 3 `Article not found` (P2 family) — separate fingerprints, do not merge.

Confidence: `high`

## Code
- `packages/functions/src/helpers/api.js:143` — `[502, 503, 520].includes(e.statusCode)` — axios 0.27 errors carry `code` and `response.status`, never `statusCode`, so this is always false and nothing is ever retried
- `packages/functions/src/helpers/api.js:145` — `throw new Error(e)` fires on attempt 1; the double-wrap produces the observed `Error: Error: read ECONNRESET` and discards `e.code`/`e.response` so no caller can classify it either
- `packages/functions/src/helpers/api.js:141` — `logger.error('[shopifyRetryGraphQL]', e)` — the exact line that fired this alert; one entry in 24h proves one attempt
- `packages/functions/src/helpers/api.js:20` — `api()` uses a plain axios client (line 9, no interceptors), fixing the error shape that line 143 mis-reads
- `packages/functions/src/helpers/api.js:128` — makeGraphQlApi passes `maxRetries: 5` into a retry loop that the line-143 predicate makes unreachable
- `packages/functions/src/services/shopifyGraphQlService.js:1238` — `await makeGraphQlApi({shop, graphqlQuery})` in updateArticlePrimary — frame 3 of the reported stack
- `packages/functions/src/services/shopifyGraphQlService.js:1175` — updateShopifyArticle's catch logs `[updateShopifyArticle] ssLtxMlroUpBbio5J2KS 570605142187` 0.28ms after the alert line and rethrows, so one socket reset fails the whole article update
- `packages/functions/src/controllers/articleController.js:551` — `Promise.all` in update(); the rejection lands here and the catch at line 618 answers 200 with `{success:false}` — merchant sees a silently failed save, not a 5xx

## Evidence
- 1 matching entries: `resource.labels.service_name="api" AND jsonPayload.tag="[shopifyRetryGraphQL]" AND timestamp>="2026-07-30T10:00:00Z" AND timestamp<="2026-07-31T10:00:00Z"`
- 1 matching entries: `resource.labels.service_name="api" AND jsonPayload.tag="[updateShopifyArticle]" AND timestamp>="2026-07-31T09:19:16Z" AND timestamp<="2026-07-31T09:49:16Z"`
- 10 matching entries: `resource.labels.service_name="api" AND textPayload:"Exception from a finished function: Error: read ECONNRESET" AND timestamp>="2026-07-31T09:19:16Z" AND timestamp<="2026-07-31T09:49:16Z"`
- 21 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-07-31T09:19:16Z" AND timestamp<="2026-07-31T09:49:16Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $1.18
- MR: https://gitlab.com/avada/blogs/-/merge_requests/810

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
