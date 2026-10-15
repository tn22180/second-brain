fingerprint: t3gwgd
service: api
message: [shopifyRetryGraphQL] Error: write ECONNRESET
app: BLOG
repo: blogs
date: 2026-10-15T02:34:22.772Z
status: fix_disabled
attempt: 1

# BLOG · api · t3gwgd

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Recurrence of recorded fingerprint gmmkec (2026-10-14, same defect, same lines, no MR shipped): shopifyRetryGraphQL logs every caught error at severity ERROR (packages/functions/src/helpers/api.js:161) before it classifies retryability four lines later (api.js:164-166), so two transient Shopify Admin socket write resets at 02:25:15 — both of which the retry loop recovered, both owning requests returning HTTP 200 — still paged the prod-error-alerts sink; there is no request failure behind this alert.

**Mechanism.** Two `[shopifyRetryGraphQL] Error: write ECONNRESET` lines fired 13.7ms apart on revision api-00190-lub, at 02:25:15.078003Z (execution 8x20pjen208o, spanId 2892355265064390668 = 0x2823b5ca0a64d00c) and 02:25:15.091709Z (execution 8x20pbztqp0h, spanId 7744444563450769433 = 0x6b79cb4c73303019) — two distinct concurrent executions, not one retried twice. Resolving both spanIds against the request logs gives GET /api/articles?limit=10&order=UPDATED_AT+desc&page=1&searchKey=Baby+Name+Meanings%3A+F at 02:25:13.471986Z, status **200**, latency 2.877196473s, and GET /api/articles/report/posts?refresh=1&shortResp=1 at 02:25:13.473931Z, status **200**, latency 4.529482761s. Cloud Run stamps the request log at request start, so each reset fired ~1.6s into its request. jsonPayload.error.code on both entries is 'ECONNRESET', which is the first element of RETRYABLE_CODES (api.js:138), so `RETRYABLE_CODES.includes(e.code)` at api.js:165 evaluated true, attempt (1) <= maxRetries (5, defaulted at api.js:120), control reached the backoff at api.js:169 — `delay((attempt + Math.random()) * 1000)` = 1.0-2.0s — re-entered the handler and succeeded. The stack is pure node internals (ClientRequest._flushOutput -> writevGeneric -> WriteWrap.onWriteComplete) with no library frames, i.e. the socket died during the request-body write of the axios client at api.js:9/26, not got — the separate `[update]` failure 3m21s later at 02:28:36.074332Z does carry got frames and is a different call path. The latency delta is the retry, measured against identical neighbours in the same 30s window: /api/articles/report/posts ran 2.222449789s clean vs 4.529482761s with the retry (+2.31s), /api/articles?...searchKey ran 1.319810012s clean vs 2.877196473s (+1.56s) — both inside backoff + one extra round trip. Proof nothing failed: all 23 requests logged on `api` between 02:25:00 and 02:25:30 are 2xx (20x 200, 3x 202), and the pre-pulled `requests` read (httpRequest.status>=500 over the full 30-min window) returned 0 entries, re-verified live. The defect is purely the ordering of the log statement: api.js:161 runs before the api.js:164 classification, so a reset the code is about to retry — and did retry successfully — is emitted at severity ERROR with a full stack. `logger` emits `severity` on this app, the sink filters severity>=ERROR, and the page fires for an error the application fully absorbed. Fleet scale of the false-page: 12 `[shopifyRetryGraphQL]` entries exist across 2026-10-08 -> 2026-10-15 (11 `api`, 1 `mcp`), every single one severity ERROR and every single one code ECONNRESET, therefore every single one retryable; no spanId repeats with a >=1s gap anywhere in that set, so no retry exhaustion occurred in seven days — 12 pages, 0 real failures. Note the inverse relationship to ixc1eq/MR 810: that retry fix is already on master (RETRYABLE_CODES + bare `throw e`), so retry now works as intended; what was never moved with it is the log level. Unrelated errors sharing this window — `[update]` got read ECONNRESET on articleId 599339565296 at 02:28:36, 2x `[fetchHtmlContent]` node-fetch resets against checkout.swaddlean.com at 02:27:47-48, 4x `[getShopifyArticleById] Article not found` for gid://shopify/Article/662292922470, 7x `Exception from a finished function: Error: read ECONNRESET` — are separate fingerprints; do not merge them into this one.

Confidence: `high`

## Code
- `packages/functions/src/helpers/api.js:161` — logger.error('[shopifyRetryGraphQL]', e) — the exact line that emitted both alert entries, placed before any retryability check, so a transient that will be retried and recovered is still logged at severity ERROR
- `packages/functions/src/helpers/api.js:165` — RETRYABLE_CODES.includes(e.code) || RETRYABLE_STATUSES.includes(e.response?.status) is evaluated 4 lines AFTER the error log; moving the severity decision to this classification is the fix
- `packages/functions/src/helpers/api.js:138` — 'ECONNRESET' is the first entry of RETRYABLE_CODES, and jsonPayload.error.code on both alert entries is 'ECONNRESET' — proof these errors took the retry branch, not the throw branch
- `packages/functions/src/helpers/api.js:169` — await delay((attempt + Math.random()) * 1000) — the 1.0-2.0s backoff that accounts for the +2.31s and +1.56s latency over clean neighbours on the same two endpoints
- `packages/functions/src/helpers/api.js:167` — throw e — the only path on which the failure actually reaches a caller; it is the point that genuinely deserves logger.error, and it did not run here (both requests returned 200)
- `packages/functions/src/helpers/api.js:120` — maxRetries = 5 default used by makeGraphQlApi, so attempt 1 was nowhere near exhaustion
- `packages/functions/src/helpers/api.js:159` — the existing logger.warn branch for Shopify auth errors is the in-file precedent for demoting a non-actionable error below the sink threshold rather than silencing it
- `packages/functions/src/helpers/api.js:26` — api() uses the module-level axios client (api.js:9) with no interceptors — the client whose request-body write the socket reset killed, matching the ClientRequest._flushOutput stack with no library frames
- `packages/functions/src/helpers/__tests__/shopifyRetryGraphQL.test.js:38` — existing regression test already drives two ECONNRESET rejections to an eventual success — the retry-succeeded path this alert represents is covered behaviourally but asserts nothing about log severity
- `packages/functions/src/helpers/__tests__/shopifyRetryGraphQL.test.js:70` — 'logs a Shopify 401 at warn, not error, and does not retry' — the existing severity assertion pattern a new test for the recovered-transient case should follow

## Evidence
- 2 matching entries: `resource.labels.service_name="api" AND jsonPayload.tag="[shopifyRetryGraphQL]" AND timestamp>="2026-10-15T02:10:17Z" AND timestamp<="2026-10-15T02:40:17Z"`
- 2 matching entries: `resource.labels.service_name="api" AND (spanId="6b79cb4c73303019" OR spanId="2823b5ca0a64d00c") AND timestamp>="2026-10-15T02:24:00Z" AND timestamp<="2026-10-15T02:27:00Z"`
- 0 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-10-15T02:10:17Z" AND timestamp<="2026-10-15T02:40:17Z" AND httpRequest.status>=500`
- 23 matching entries: `resource.labels.service_name="api" AND httpRequest.requestUrl!="" AND timestamp>="2026-10-15T02:25:00Z" AND timestamp<="2026-10-15T02:25:30Z"`
- 12 matching entries: `jsonPayload.tag="[shopifyRetryGraphQL]" AND timestamp>="2026-10-08T00:00:00Z" AND timestamp<="2026-10-15T03:00:00Z"`

## Job
- analyze rounds: 1
- cost: $1.37

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
