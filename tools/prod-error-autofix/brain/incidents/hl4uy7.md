fingerprint: hl4uy7
service: api
message: [update] k0DUcjj6hJnxI11CxKxp articleId: 595848233175 update error HTTPError: Response code 502 (Bad Gateway)
app: BLOG
repo: blogs
date: 2026-09-08T02:38:19.476Z
status: fix_disabled
attempt: 1

# BLOG · api · hl4uy7

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Shopify Admin GraphQL answered one transient HTTP 502 to the `shopLocales` query that articleController.update issues through the raw shopify-api-node client (got), which has no retry, so the whole PUT /api/article/595848233175 for shop k0DUcjj6hJnxI11CxKxp aborted into update's catch.

**Mechanism.** The alerted line is logged by articleController.update's catch (articleController.js:733), and the stack frame `/workspace/node_modules/got/dist/source/as-promise/index.js:118:42` names got — which in this repo is only reachable through shopify-api-node@3.15.0 (`got: ^11.1.4` in yarn.lock:29163), i.e. through `initShopify(...).graphql(...)`, never through `makeGraphQlApi`, whose transport is axios (`api()` at helpers/api.js:126). Inside update's try the only got call with no logger of its own is `shopLocalesGraphQL(shopify)` at articleController.js:611, which is a bare `shopify.graphql(...)` (shopLocalesGraphQL.js:8) on a client built with `autoLimit: true` and no retry (shopifyService.js:26). The other candidates are excluded by evidence, not by reading: `updateShopifyArticle` logs `[updateShopifyArticle]` before rethrowing (shopifyGraphQlService.js:1191) and `makeGraphQlApi` failures log `[shopifyRetryGraphQL]` (helpers/api.js:161) — a query scoped to execution_id r033hzj3domc returns exactly 1 log entry in the whole project, the `[update]` error itself, so neither of those ran. seoProxyApi swallows and logs `[seoProxyApi]` (api.js:102-104) and never rethrows. Had the call gone through makeGraphQlApi the 502 would have been retried: 502 is already in RETRYABLE_STATUSES (api.js:145). No 5xx request log exists because update deliberately answers 200 with `{success: false}` (articleController.js:737), which is why the requests read for this window is empty.

Confidence: `high`

## Code
- `packages/functions/src/controllers/articleController.js:611` — the unretried `await shopLocalesGraphQL(shopify)` inside update's try — the only got-backed call on this path with no logger of its own
- `packages/functions/src/helpers/graphql/shopLocalesGraphQL.js:8` — bare `shopify.graphql(...)` via shopify-api-node — got is its HTTP client, matching the stack frame in the alert
- `packages/functions/src/services/shopifyService.js:26` — initShopify builds the client with autoLimit only; no retry, no timeout, so a single 502 rejects
- `packages/functions/src/services/shopifyGraphQlService.js:1191` — updateShopifyArticle logs [updateShopifyArticle] before rethrowing — absent from the window, so it is not the failing call
- `packages/functions/src/helpers/api.js:145` — RETRYABLE_STATUSES already contains 502; the axios path via makeGraphQlApi/shopifyRetryGraphQL would have absorbed this failure
- `packages/functions/src/helpers/api.js:161` — [shopifyRetryGraphQL] error log — also absent, so the failing call bypassed makeGraphQlApi entirely
- `packages/functions/src/controllers/articleController.js:733` — the catch that emitted the alerted line, with shop id + articleId
- `packages/functions/src/controllers/articleController.js:737` — returns 200 {success:false}, which is why no httpRequest.status>=500 log exists for this failure

## Evidence
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api" OR resource.labels.job_name="api") AND timestamp>="2026-09-07T08:35:46.082Z" AND timestamp<="2026-09-07T09:05:46.082Z" AND labels.execution_id="r033hzj3domc"`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-06T09:00:00Z" AND timestamp<="2026-09-08T00:00:00Z" AND jsonPayload.tag="[update]" AND jsonPayload.message:"Bad Gateway"`
- 1 matching entries: `timestamp>="2026-09-07T08:20:00Z" AND timestamp<="2026-09-07T09:20:00Z" AND jsonPayload.message:"502 (Bad Gateway)"`
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api" OR resource.labels.job_name="api") AND timestamp>="2026-09-07T08:35:46.082Z" AND timestamp<="2026-09-07T09:05:46.082Z" AND severity>=ERROR`

## Job
- analyze rounds: 2
- cost: $4.36

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
