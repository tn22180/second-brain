fingerprint: 1bhevcs
service: api
message: [getMainThemeId] RequestError: read ECONNRESET
app: BLOG
repo: blogs
date: 2026-10-15T02:04:27.996Z
status: fix_disabled
attempt: 2

# BLOG · api · 1bhevcs

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Recurrence of recorded fingerprint 1q9n03 (also re-fired as 16cmdy4, sibling-symptom in udahv5) on a third caller: shopifyRetryError classifies retryability only by HTTP status codes found in error.message, so the socket-level `RequestError: read ECONNRESET` that shopify.theme.list hit inside getMainThemeId is rethrown on attempt 0 with none of the caller's maxRetry=10 budget spent, and the `new Error(e)` rewrap destroys e.code so no caller can classify it either.

**Mechanism.** appBlockController.blockLoader awaits getMainThemeId(shopify) (appBlockController.js:43) → getMainThemeId wraps shopify.theme.list({fields:'id,role'}) in shopifyRetryApi(handler, 0, 10) (shopifyService.js:691-695). Shopify's edge reset the keep-alive TLS socket mid-read, so shopify-api-node's got client threw RequestError{code:'ECONNRESET'} with no HTTP response. shopifyRetryError (shopifyService.js:161-168) reads only headers['retry-after'] and message.includes(429|430|502|503); an ECONNRESET carries neither, so it returns 0, and shopifyRetryApi takes `if (!retry || attempt >= maxRetry) throw new Error(e)` (shopifyService.js:147) on the very first attempt. The log proves both halves of that claim: the alerted line's jsonPayload.error has name="Error" and message="RequestError: read ECONNRESET" — the double prefix produced by stringifying the got error through `new Error(e)` — and carries NO `code` field, whereas the independent getProductsGraphQL line 104ms earlier in a different execution (8w605453qu4j) still has error.code="ECONNRESET" and a got-rooted stack. The alerted stack's entry frame is shopifyRetryApi (lib/services/shopifyService.js:197 = the throw at src:147), then getMainThemeId (lib:797 = src:691), then blockLoader (lib:59 = src:43). getMainThemeId logs '[getMainThemeId]' at 02:00:22.478513 (shopifyService.js:705) and rethrows; 259µs later blockLoader's catch logs severity ERROR at 02:00:22.478772 (appBlockController.js:104) — same execution_id 8w602xigrwh1, which is this alert — then answers HTTP 200 with {data: [], error} (appBlockController.js:105), which is why the requests read (httpRequest.status>=500) is empty, counts requests=0. The correct classifier already exists one file over: shopifyRetryGraphQL retries on e.code in RETRYABLE_CODES, which includes 'ECONNRESET' (helpers/api.js:165). Secondary defect on the same path: the recursive call at shopifyService.js:149 omits maxRetry, so any retry that does happen silently reverts the caller's 10 to SHOPIFY_MAX_RETRY=50.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyService.js:147` — throw new Error(e) fires on attempt 0 because retry===0, spending none of maxRetry=10; the rewrap is what produced the logged 'Error: RequestError: read ECONNRESET' with error.name='Error' and no error.code
- `packages/functions/src/services/shopifyService.js:167` — classifier matches only HTTP status codes inside error.message plus a retry-after header; a socket-level ECONNRESET has neither, so it returns 0 = non-retryable
- `packages/functions/src/services/shopifyService.js:691` — the alert's stack frame: shopify.theme.list wrapped in shopifyRetryApi(handler, 0, 10) whose budget never applies to connection resets
- `packages/functions/src/services/shopifyService.js:705` — logger.error('[getMainThemeId]', e.message) — the exact alerted message text, then rethrow
- `packages/functions/src/services/shopifyService.js:149` — recursive retry drops the maxRetry argument, reverting an explicit 10 to the default 50
- `packages/functions/src/controllers/appBlockController.js:43` — blockLoader's getMainThemeId call, the frame below getMainThemeId in the stack
- `packages/functions/src/controllers/appBlockController.js:104` — logger.error at severity ERROR on a transient network blip is what fires this alert
- `packages/functions/src/controllers/appBlockController.js:105` — answers 200 with {data: [], error} — why requests>=500 is empty and the merchant's app-blocks panel renders empty instead
- `packages/functions/src/helpers/api.js:165` — the in-repo correct behaviour the REST helper is missing: classify by e.code against RETRYABLE_CODES, which contains 'ECONNRESET'

## Evidence
- 14 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-10-15T01:45:24.952Z" AND timestamp<="2026-10-15T02:15:24.952Z" AND "ECONNRESET"`
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-10-15T01:45:24.952Z" AND timestamp<="2026-10-15T02:15:24.952Z" AND jsonPayload.tag="[getMainThemeId]"`
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-10-15T01:45:24.952Z" AND timestamp<="2026-10-15T02:15:24.952Z" AND jsonPayload.tag="[blockLoader]"`
- 1 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-10-15T01:45:24.952Z" AND timestamp<="2026-10-15T02:15:24.952Z" AND jsonPayload.tag="[getProductsGraphQL]"`
- 11 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-10-15T01:45:24.952Z" AND timestamp<="2026-10-15T02:15:24.952Z" AND textPayload:"Exception from a finished function: Error: read ECONNRESET"`
- 119 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-10-14T02:15:00Z" AND timestamp<="2026-10-15T02:15:24.952Z" AND "ECONNRESET"`

## Job
- analyze rounds: 1
- cost: $1.28

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
