fingerprint: urawwr
service: proxy
message: [verifyAppProxySignature] Invalid signature <http://ocha21.myshopify.com|ocha21.myshopify.com>
app: BLOG
repo: blogs
date: 2026-07-31T03:45:29.655Z
status: mr_open
attempt: 1

# BLOG · proxy · urawwr

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/792

**Root cause.** The alert is not a defect: verifyAppProxySignature correctly rejected one tampered App Proxy request (signature last byte mutated d9→e0 vs a request that succeeded 0.79s earlier with identical query params), but that legitimate 403 rejection path is logged with logger.error, which emits severity=ERROR and trips the prod-error-alerts sink.

**Mechanism.** At 03:31:04.832Z GET /proxy/seoOn-preview?...&shop=ocha21.myshopify.com&signature=4e10918f...caefa3d9 (UA Ruby) returned 200 — HMAC verified. At 03:31:05.620Z the identical query string (same id=571128840226, same noCache=ae3fbdde-..., same timestamp=1785468664) arrived with signature 4e10918f...caefa3e0, differing only in the final byte. isEqualHex (packages/functions/src/middleware/verifyAppProxySignature.js:57) returned false, the handler logged logger.error('[verifyAppProxySignature] Invalid signature', params?.shop) at line 42 and answered 403 at line 43. logger.error writes severity ERROR (packages/functions/src/helpers/logger.js:89), the sink filters severity>=ERROR, so a correct security rejection became a Slack page. Over 24h only 1 of 105 seoOn-preview requests was a 403 (88x200, 4x400, 12x500) — the HMAC path and SHOPIFY_SECRET are demonstrably correct. SEPARATE cause in the same window, not merged into this one: 8x 500 on /proxy/tags and /proxy/posts-by-tag for 1f790c-c4.myshopify.com, all from Shopify HTTPError 401 Unauthorized (revoked/uninstalled token, pattern P5) — different fingerprint, different fix.

Confidence: `high`

## Code
- `packages/functions/src/middleware/verifyAppProxySignature.js:42` — logger.error on the invalid-signature branch — emits severity ERROR for a normal, expected rejection, which is what paged
- `packages/functions/src/middleware/verifyAppProxySignature.js:43` — ctx.status = 403 — the response itself is correct; nothing here needs changing
- `packages/functions/src/middleware/verifyAppProxySignature.js:57` — isEqualHex returned false for the one-byte-mutated signature; length-equal so timingSafeEqual ran and correctly rejected
- `packages/functions/src/helpers/logger.js:89` — logger.error maps to severity ERROR, the exact threshold the prod-error-alerts sink filters on
- `packages/functions/src/helpers/logger.js:91` — logger.warn maps to severity WARNING — below the sink threshold, and enabled at the production default level 'warn', so the line stays in Cloud Logging without alerting
- `packages/functions/src/routes/proxy.js:21` — the only route mounting verifyAppProxySignature, so /proxy/seoOn-preview is the sole source of this log line

## Evidence
- 1 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-07-30T03:00:00Z" AND timestamp<="2026-07-31T04:00:00Z" AND textPayload:"verifyAppProxySignature"`
- 105 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-07-30T04:00:00Z" AND timestamp<="2026-07-31T04:00:00Z" AND httpRequest.requestUrl:"seoOn-preview"`
- 3 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-07-31T03:16:00Z" AND timestamp<="2026-07-31T03:46:00Z" AND httpRequest.requestUrl:"seoOn-preview"`
- 8 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-07-31T03:16:07.576Z" AND timestamp<="2026-07-31T03:46:07.576Z" AND httpRequest.status>=500`
- 17 matching entries: `(resource.labels.service_name="proxy") AND timestamp>="2026-07-31T03:16:07.576Z" AND timestamp<="2026-07-31T03:46:07.576Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.53
- branch: `fix/prod-blog-urawwr`
- fix commit: `22f1e2e0f5296c537f4457882155418090bf9ad5`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/792
- tests: 199 tests, 3 failing · baseline 3 failing · reproduce test fails without the fix

```
packages/functions/src/middleware/verifyAppProxySignature.js | 8 +++++++-
 1 file changed, 7 insertions(+), 1 deletion(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
