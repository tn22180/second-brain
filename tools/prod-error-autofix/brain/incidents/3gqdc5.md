fingerprint: 3gqdc5
service: api
message: [getEnableBlocks] kozjvGcNBaGdLMGB7Pxq Error: HTTPError: Response code 401 (Unauthorized)
app: BLOG
repo: blogs
date: 2026-08-12T07:17:45.726Z
status: mr_open
attempt: 1

# BLOG · api · 3gqdc5

**Outcome.** duplicate of ksxs3b — MR https://gitlab.com/avada/blogs/-/merge_requests/842

**Root cause.** Duplicate of fingerprint ksxs3b (MR https://gitlab.com/avada/blogs/-/merge_requests/842 open, unmerged, and its diff already covers this exact frame): a ~130 ms Shopify Admin auth blip returned HTTP 401 to shop kozjvGcNBaGdLMGB7Pxq at 2026-08-05T08:20:52.8–52.95Z, and on the REST/got path shopifyRetryApi flattens got's HTTPError into `new Error(e)` — dropping response.statusCode — so getEnableBlocks cannot classify the 401 as an auth error and logs it at logger.error, paging the sink for an upstream 4xx.

**Mechanism.** GET /api/shopify/block (routes/api.js:191) → shopifyController.getEnableBlocks (shopifyController.js:612) → getAppBlockByType (shopifyService.js:771). No `[getMainThemeId]` line exists anywhere in the 24h day and the alert stack shows getAppBlockByType calling getAppBlocks directly, so the theme lookup was not the throwing frame: the 401 came from the `shopify.asset.get(themeId, {asset:{key}})` call wrapped by shopifyRetryApi inside getAppBlocks (shopifyService.js:747). shopifyRetryError (shopifyService.js:160) only matches [429,430,502,503] against `error.message`, so 401 is correctly non-retryable, but line 146 then does `throw new Error(e)`, which stringifies got's HTTPError into a plain Error whose message is 'HTTPError: Response code 401 (Unauthorized)' and which carries neither `response.statusCode` nor `statusCode`. getAppBlocks has no catch of its own (shopifyService.js:739), so the flattened Error reaches getEnableBlocks's catch at shopifyController.js:625, which logs unconditionally at logger.error — the exact alert line. isShopifyAuthError (helpers/api.js:151) is already three-term on master and would classify a got 401 via `e.response.statusCode`, but it is wired only into shopifyRetryGraphQL (api.js:158), graphQLProducts.js:64 and shopifyGraphQlService.js:2466 — the axios/GraphQL path — and it could not work here anyway because line 146 has already stripped the status. The upstream trigger is transient, not a revoked token: in the whole of 2026-08-05 on service `api` there are exactly 4 lines containing '401 (Unauthorized)' and all 4 fall inside 113 ms (52.839 [blockLoader], 52.839 [getPostsGraphQL], 52.943 [getProductsGraphQL], 52.951 [getEnableBlocks]), plus [handleFetchPdfFiles]/[shopifyRetryGraphQL] 'status code 401' at 52.818; the 3 lines naming kozjvGcNBaGdLMGB7Pxq span two different instanceIds (001548f72910… and 001548f729da…), so it is a shop/Shopify-side credential blip, not one instance's stale client, and there is no uninstall trace for that shop in 2026-08-04/06. The same blip produced the GET /api/options 500 already recorded as w6i1j5 (MR 856, errorHandler status mapping) — that fix is in a different file and does not stop this line from logging at error.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyService.js:146` — `if (!retry || attempt >= maxRetry) throw new Error(e)` — flattens got's HTTPError, losing response.statusCode; the reason the 401 cannot be classified downstream
- `packages/functions/src/controllers/shopifyController.js:625` — getEnableBlocks catch logs every failure at logger.error — the exact '[getEnableBlocks] kozjvGcNBaGdLMGB7Pxq Error: HTTPError: Response code 401 (Unauthorized)' line the alert fired on
- `packages/functions/src/services/shopifyService.js:747` — the shopifyRetryApi(() => shopify.asset.get(...)) call inside getAppBlocks — the throwing frame in the alert stack (lib/shopifyService.js:860)
- `packages/functions/src/services/shopifyService.js:739` — getAppBlocks has no try/catch, so the flattened Error propagates untouched to the controller
- `packages/functions/src/services/shopifyService.js:771` — getAppBlockByType — the intermediate frame (lib/shopifyService.js:889); themeId was supplied by the caller path so getMainThemeId never logged
- `packages/functions/src/services/shopifyService.js:160` — shopifyRetryError matches only [429,430,502,503] on error.message, so 401 takes the non-retryable branch at line 146
- `packages/functions/src/helpers/api.js:151` — isShopifyAuthError already reads e.response.statusCode (got shape) but is wired only into the GraphQL/axios path, and cannot fire here because the status is stripped upstream
- `packages/functions/src/controllers/shopifyController.js:612` — getEnableBlocks entry, the handler behind GET /api/shopify/block in the alert stack

## Evidence
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-05T00:00:00Z" AND timestamp<="2026-08-06T00:00:00Z" AND jsonPayload.message:"getEnableBlocks"`
- 4 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-05T00:00:00Z" AND timestamp<="2026-08-06T00:00:00Z" AND jsonPayload.message:"401 (Unauthorized)"`
- 3 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-05T00:00:00Z" AND timestamp<="2026-08-06T00:00:00Z" AND jsonPayload.message:"kozjvGcNBaGdLMGB7Pxq"`
- 6 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-05T08:20:52Z" AND timestamp<="2026-08-05T08:20:54Z" AND severity>=ERROR`
- 3 matching entries: `timestamp>="2026-08-04T00:00:00Z" AND timestamp<="2026-08-06T00:00:00Z" AND (textPayload:"kozjvGcNBaGdLMGB7Pxq" OR jsonPayload.message:"kozjvGcNBaGdLMGB7Pxq")`

## Job
- analyze rounds: 1
- cost: $1.50
- MR: https://gitlab.com/avada/blogs/-/merge_requests/842

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
