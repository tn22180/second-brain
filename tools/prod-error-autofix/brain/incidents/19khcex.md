fingerprint: 19khcex
service: api
message: [setupTemplates] RequestError: read ECONNRESET
app: BLOG
repo: blogs
date: 2026-10-15T03:10:56.706Z
status: fix_disabled
attempt: 1

# BLOG · api · 19khcex

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Recurrence of recorded fingerprint 1q9n03 / 1bhevcs (same defect, same lines, no MR shipped) on a new caller: shopifyRetryError classifies retryability only by HTTP status codes found in error.message, so the socket-level `RequestError: read ECONNRESET` that shopify.theme.list hit inside getMainThemeId — reached this time from setupTemplates on the after-login path — was rethrown on attempt 0 with none of the caller's maxRetry=10 budget spent, and the `new Error(e)` rewrap destroyed e.code so no caller upstream could classify it either.

**Mechanism.** afterLoginService isolates theme work in a try block and fires setupTemplates as fire-and-forget (after-login.service.js:36-37). setupTemplates awaits getMainThemeId(shopify) (after-login.service.js:96) → getMainThemeId wraps shopify.theme.list({fields:'id,role'}) in shopifyRetryApi(handler, 0, 10) (shopifyService.js:691-695). Shopify's edge reset the keep-alive TLS socket mid-read, so shopify-api-node's got client threw RequestError{code:'ECONNRESET'} with no HTTP response. shopifyRetryError (shopifyService.js:161-168) reads only headers['retry-after'] and message.includes(429|430|502|503); an ECONNRESET carries neither, so it returns 0, and shopifyRetryApi takes `if (!retry || attempt >= maxRetry) throw new Error(e)` (shopifyService.js:147) on the very first attempt. The log proves the rewrap: getMainThemeId logs e.message at shopifyService.js:705 and the stored message is '[getMainThemeId] RequestError: read ECONNRESET' — the double prefix only exists if String(RequestError) was stuffed into a new Error's message; the entry carries NO jsonPayload.error object and no `code` field, whereas the independent got-rooted ECONNRESETs in the same window ([fetchAllImagesFromShopify] 02:57:59.098626, [upload] 02:46:32.168699) still have error.code='ECONNRESET', error.name='RequestError' and a got/core/index.js stack. getMainThemeId rethrows (shopifyService.js:706); 241µs later setupTemplates' outer catch logs e.message at after-login.service.js:116, giving the alerted text '[setupTemplates] RequestError: read ECONNRESET' with no shop id — which identifies line 116, not the shop-id-carrying logger at line 37 or 39. Both lines share execution_id 8yamgcskqv1v and a full read of that execution returns exactly those 2 entries and no request log: setupTemplates swallows, the login request still answered 200, which is why the requests read (httpRequest.status>=500) counts 0. The correct classifier already exists one file over: shopifyRetryGraphQL retries on e.code in RETRYABLE_CODES, which includes 'ECONNRESET' (helpers/api.js:165, list at api.js:137-144). Secondary defect on the same path: the recursive call at shopifyService.js:149 omits maxRetry, so any retry that does happen silently reverts the caller's 10 to SHOPIFY_MAX_RETRY.

Confidence: `high`

## Code
- `packages/functions/src/services/shopifyService.js:147` — throw new Error(e) fires on attempt 0 because retry===0, spending none of maxRetry=10; the rewrap is what produced the logged 'RequestError: read ECONNRESET' message with no error object and no error.code
- `packages/functions/src/services/shopifyService.js:167` — classifier matches only HTTP status codes inside error.message plus a retry-after header; a socket-level ECONNRESET has neither, so it returns 0 = non-retryable
- `packages/functions/src/services/shopifyService.js:691` — shopify.theme.list wrapped in shopifyRetryApi(handler, 0, 10) whose budget never applies to connection resets
- `packages/functions/src/services/shopifyService.js:705` — logger.error('[getMainThemeId]', e.message) — the 02:59:54.669349Z line, same execution as the alert, then rethrow at 706
- `packages/functions/src/services/shopifyService.js:149` — recursive retry drops the maxRetry argument, reverting an explicit 10 to the default SHOPIFY_MAX_RETRY
- `packages/functions/src/services/after-login.service.js:96` — setupTemplates' getMainThemeId call — the frame the rethrow lands in
- `packages/functions/src/services/after-login.service.js:116` — logger.error('[setupTemplates]', e.message) at severity ERROR on a transient network blip is the exact alerted text; logs e.message only, no shop id — matches the stored payload
- `packages/functions/src/services/after-login.service.js:37` — void setupTemplates(...).catch(...) — fire-and-forget, so the login request still answered 200 and the requests>=500 read is empty
- `packages/functions/src/helpers/api.js:165` — the in-repo correct behaviour the REST helper lacks: classify by e.code against RETRYABLE_CODES
- `packages/functions/src/helpers/api.js:138` — 'ECONNRESET' is already listed as retryable for the GraphQL path

## Evidence
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-10-15T02:45:01.133Z" AND timestamp<="2026-10-15T03:15:01.133Z" AND labels.execution_id="8yamgcskqv1v"`
- 1 matching entries: `timestamp>="2026-10-14T03:15:00Z" AND timestamp<="2026-10-15T03:15:01.133Z" AND jsonPayload.tag="[setupTemplates]"`
- 2 matching entries: `timestamp>="2026-10-14T03:15:00Z" AND timestamp<="2026-10-15T03:15:01.133Z" AND jsonPayload.tag="[getMainThemeId]"`
- 21 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-10-15T02:45:01.133Z" AND timestamp<="2026-10-15T03:15:01.133Z" AND "ECONNRESET"`
- 165 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-10-14T03:15:00Z" AND timestamp<="2026-10-15T03:15:01.133Z" AND "ECONNRESET"`

## Job
- analyze rounds: 1
- cost: $1.18

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
