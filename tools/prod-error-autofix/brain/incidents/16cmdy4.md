fingerprint: 16cmdy4
service: api
message: [getEnableBlocks] MqDVC99Ph0SnhMuq2hL8 Error: RequestError: read ECONNRESET
app: BLOG
repo: blogs
date: 2026-10-14T16:28:24.880Z
status: fix_disabled
attempt: 1

# BLOG · api · 16cmdy4

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Recurrence of recorded fingerprint 1q9n03 (same day, same defect, different caller): shopifyRetryApi's classifier shopifyRetryError only recognises HTTP status codes embedded in error.message, so a socket-level `RequestError: read ECONNRESET` from shopify.asset.get inside getAppBlocks is rethrown on attempt 0 with zero retries, even though the call site passed maxRetry=10.

**Mechanism.** GET /api/shopify/block → shopifyController.getEnableBlocks (shopifyController.js:614) calls getAppBlockByType (shopifyController.js:620) → getAppBlocks (shopifyService.js:780) → shopify.asset.get(themeId, {asset:{key}}) wrapped in shopifyRetryApi(handler, 0, 10) (shopifyService.js:748). Shopify's edge reset the TCP socket, so shopify-api-node's got client threw a RequestError carrying code ECONNRESET and no HTTP response. shopifyRetryError (shopifyService.js:161-167) reads only headers['retry-after'] and codes.some(code => message?.includes?.(code)) against [429,430,502,503]; an ECONNRESET has no response headers and no status digits in its message, so it returns 0. shopifyRetryApi then hits `if (!retry || attempt >= maxRetry) throw new Error(e)` (shopifyService.js:147) on the very first attempt — the maxRetry=10 budget is never spent. `new Error(e)` stringifies the got error, which is exactly why the logged message carries the double prefix `Error: RequestError: read ECONNRESET` and why e.code is destroyed before any caller can classify it. getEnableBlocks' catch (shopifyController.js:627) logs severity ERROR — firing this alert — then answers HTTP 200 with {success:false,error}, which is why the requests read (httpRequest.status>=500) is empty. The sibling GraphQL helper does this correctly: shopifyRetryGraphQL classifies on e.code against RETRYABLE_CODES which includes 'ECONNRESET' (helpers/api.js:137-138, 165) and rethrows the original e (api.js:167), which is why 4 ECONNRESETs in the same 24h window survived as [shopifyRetryGraphQL] lines without failing their requests while the 2 that went through shopifyRetryApi (this one and [blockLoader] at 12:11:48Z) died on attempt 0. Secondary defect on the same path: the recursive call at shopifyService.js:149 omits maxRetry, so any retry that does happen silently reverts the budget from the caller's 10 to the default SHOPIFY_MAX_RETRY=50.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyService.js:147` — throw new Error(e) fires on attempt 0 because retry===0, spending none of maxRetry=10; the re-wrap also discards e.code/e.stack and produces the exact double-prefixed message in the alert
- `packages/functions/src/services/shopifyService.js:167` — classifier matches only HTTP status codes inside error.message; a socket-level ECONNRESET has no status and no retry-after header, so it returns 0 = non-retryable
- `packages/functions/src/services/shopifyService.js:748` — the shopifyRetryApi(shopify.asset.get, 0, 10) call inside getAppBlocks — the frame named in the stack, whose maxRetry=10 never applies to connection resets
- `packages/functions/src/services/shopifyService.js:149` — recursive retry drops the maxRetry argument, reverting a caller's explicit 10 to the default 50
- `packages/functions/src/services/shopifyService.js:780` — getAppBlockByType's getAppBlocks call — the intermediate frame between getEnableBlocks and the throw
- `packages/functions/src/controllers/shopifyController.js:620` — getEnableBlocks' getAppBlockByType call, the top application frame in the stack
- `packages/functions/src/controllers/shopifyController.js:627` — logger.error on a transient network blip is what fires this ERROR alert; the next lines answer 200 with success:false, explaining requests=0
- `packages/functions/src/helpers/api.js:165` — the GraphQL twin classifies by e.code against RETRYABLE_CODES (includes ECONNRESET) and does retry — the correct behaviour the REST helper lacks
- `packages/functions/src/helpers/api.js:138` — 'ECONNRESET' is already an accepted retryable code on the GraphQL path, so the fleet already treats this class of error as transient

## Evidence
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-10-14T16:11:07.430Z" AND timestamp<="2026-10-14T16:41:07.430Z" AND jsonPayload.tag="[getEnableBlocks]"`
- 9 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-10-13T16:00:00Z" AND timestamp<="2026-10-14T16:45:00Z" AND jsonPayload.message:"ECONNRESET"`
- 2 matching entries: `timestamp>="2026-10-13T16:00:00Z" AND timestamp<="2026-10-14T16:45:00Z" AND jsonPayload.message:"shopifyRetryApi"`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api" OR resource.labels.job_name="api") AND timestamp>="2026-10-14T16:11:07.430Z" AND timestamp<="2026-10-14T16:41:07.430Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $0.73

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
