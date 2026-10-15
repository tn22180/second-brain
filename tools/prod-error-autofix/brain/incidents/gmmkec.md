fingerprint: gmmkec
service: mcp
message: [shopifyRetryGraphQL] Error: read ECONNRESET
app: BLOG
repo: blogs
date: 2026-10-14T15:34:49.857Z
status: fix_disabled
attempt: 1

# BLOG · mcp · gmmkec

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** shopifyRetryGraphQL logs every caught error at severity ERROR (api.js:161) before it decides retryability (api.js:164-166), so the single transient Shopify Admin socket reset at 15:30:42.743681Z — which the retry loop then recovered from, the owning request returning HTTP 200 — still paged the prod-error-alerts sink; there is no request failure behind this alert.

**Mechanism.** The alert log line carries spanId 14751613514590196200 = 0xccb84255890011e8, which is exactly the spanId of the mcp request log at 2026-10-14T15:30:42.618934Z with status 200 and latency 2.183910149s. Cloud Run stamps a request log at request start, so that request ran 15:30:42.618934 -> 15:30:44.802. The ECONNRESET fired 0.125s in. jsonPayload.error.code is 'ECONNRESET', which is the first entry of RETRYABLE_CODES (packages/functions/src/helpers/api.js:138), so `isRetryError` at api.js:165 evaluated true, attempt (1) <= maxRetries (5, api.js:128), and control went to the backoff at api.js:169 — `delay((attempt + Math.random()) * 1000)` = 1.0-2.0s — then re-entered the handler and succeeded. That 1.0-2.0s of backoff plus one successful round trip is the whole explanation for the 2.18s latency against 0.088-0.734s for the 16 sibling mcp requests in the same 25s window. The defect is purely the ordering of the log: api.js:161 runs before the api.js:164 classification, so a reset that the code is about to retry — and did retry successfully — is emitted as severity ERROR with a full stack. `logger` emits `severity` on this app (helpers/logger.js), the prod-error-alerts sink filters severity>=ERROR, and the alert fired for an error the application fully absorbed. Confirmation that nothing failed: zero mcp requests with httpRequest.status>=500 exist in the entire 7 days 2026-10-07 -> 2026-10-14, and the pre-pulled `requests` read for the alert window returned 0 entries. Fleet scale of the false-page: 6 `[shopifyRetryGraphQL]` lines in 7 days, all severity ERROR (api 4x ECONNRESET, api 1x ERR_BAD_RESPONSE, mcp 1x ECONNRESET) — every recovered transient is one page. Note this is the inverse of incident ixc1eq / MR 810: that MR's fix is already on master (commit 2af29a5c3, 2026-08-21, RETRYABLE_CODES + `throw e`), the retry now works as intended, and what is left over is the log level that was never moved with it.

Confidence: `high`

## Code
- `packages/functions/src/helpers/api.js:161` — `logger.error('[shopifyRetryGraphQL]', e)` — the exact line that emitted this alert, placed before any retryability check, so a transient that will be retried and recovered is still logged at severity ERROR
- `packages/functions/src/helpers/api.js:165` — `RETRYABLE_CODES.includes(e.code) || RETRYABLE_STATUSES.includes(e.response?.status)` is evaluated 4 lines AFTER the error log; moving the severity decision here is the fix
- `packages/functions/src/helpers/api.js:138` — 'ECONNRESET' is in RETRYABLE_CODES, and jsonPayload.error.code on the alert entry is 'ECONNRESET' — proof this specific error took the retry branch, not the throw branch
- `packages/functions/src/helpers/api.js:169` — `await delay((attempt + Math.random()) * 1000)` — the 1.0-2.0s backoff that accounts for the owning request's 2.18s latency versus 0.088-0.734s for its 16 neighbours
- `packages/functions/src/helpers/api.js:167` — `throw e` — the only path on which the failure actually reaches a caller; it is the point that genuinely deserves logger.error, and it did not run here
- `packages/functions/src/helpers/api.js:128` — `maxRetries = 5` default passed from makeGraphQlApi, so attempt 1 was nowhere near exhaustion
- `packages/functions/src/helpers/api.js:159` — the existing `logger.warn` branch for Shopify auth errors is the precedent for demoting a non-actionable error below the sink threshold rather than silencing it
- `packages/functions/src/helpers/__tests__/shopifyRetryGraphQL.test.js:38` — existing regression test already drives two ECONNRESET rejections to an eventual success — the retry-succeeded path this alert represents is covered behaviourally but asserts nothing about log severity

## Evidence
- 1 matching entries: `resource.labels.service_name="mcp" AND jsonPayload.tag="[shopifyRetryGraphQL]" AND timestamp>="2026-10-14T15:16:14Z" AND timestamp<="2026-10-14T15:46:14Z"`
- 1 matching entries: `resource.labels.service_name="mcp" AND spanId="ccb84255890011e8" AND timestamp>="2026-10-14T15:30:00Z" AND timestamp<="2026-10-14T15:31:00Z"`
- 16 matching entries: `resource.labels.service_name="mcp" AND timestamp>="2026-10-14T15:30:35Z" AND timestamp<="2026-10-14T15:31:00Z" AND httpRequest.status>=200`
- 0 matching entries: `resource.labels.service_name="mcp" AND timestamp>="2026-10-07T00:00:00Z" AND httpRequest.status>=500`
- 6 matching entries: `jsonPayload.tag="[shopifyRetryGraphQL]" AND timestamp>="2026-10-07T00:00:00Z" AND timestamp<="2026-10-14T16:00:00Z"`

## Job
- analyze rounds: 1
- cost: $1.12

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
