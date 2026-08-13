fingerprint: 4kz4kp
service: apigen2
message: HTTP 500 PUT /api/redirects/resolve
app: SEO
repo: seo
date: 2026-08-12T17:48:36.279Z
status: mr_open
attempt: 1

# SEO · apigen2 · 4kz4kp

**Outcome.** duplicate of 18xbru1 — MR https://gitlab.com/avada/seo/-/merge_requests/2107

**Root cause.** PUT /api/redirects/resolve returns 500 because handleResolveRedirectSkipError's update-path catch handler responds to a Shopify REST 429 by firing a second, unguarded REST call (shopify.redirect.delete) which 429s again and rejects out of the function into redirectController.resolve's catch.

**Mechanism.** resolve() fans the selected 404 items out through pLimit(2) into handleResolveRedirectSkipError (redirectController.js:445-446). Each item does 1 GraphQL lookup + 1 REST write against Shopify's 2-calls/sec REST bucket, and initShopify defaults to maxRetries: 0 (shopifyService.js:63), so writes 429 constantly — 124 'UPDATE TARGET URL error Exceeded 2 calls per second' + ~400 'CREATE NEW URL error' lines in the 30-min window. The CREATE branch's catch only touches Firestore (urlRedirectService.js:93) and is safe. The UPDATE branch's catch (urlRedirectService.js:74-83) instead issues shopify.redirect.delete() with no .catch — a third REST call into an already-exhausted bucket. Its rejection is not caught, propagates through `catch (e) { throw e }` (:97-98) and Promise.all into redirectController.js:451, which logs '[redirectController] Response code 429 (Too Many Requests)' and sets ctx.status = 500. Proven per-request: for executions nxa3m5nh3a1v, nxoisdm1ayd7 and nxore5u4vtpd the log line immediately preceding the controller's 429 (60-120ms earlier) is 'UPDATE TARGET URL error', and no other unguarded Shopify call exists on this path (getShopifyRedirectByPath logs '[getShopifyRedirectByPath]' before rethrowing — 0 such lines in the window). Because Promise.all rejects on first rejection while the remaining pLimit chains keep running, the same execution_id keeps logging swallowed 429s for ~10s after the 500 is already sent. The 2 remaining 500s (nxa6xn8k7d28, nxp59j1uqu8v) carry the identical controller message but have zero other app log lines in their execution, so their preceding branch is not directly evidenced.

Confidence: `high`

## Code
- `packages/functions/src/services/urlRedirectService.js:80` — shopify.redirect.delete() inside the update-path catch has no .catch — its 429 rejection is what escapes and becomes the 500
- `packages/functions/src/services/urlRedirectService.js:74` — the .catch that logs 'UPDATE TARGET URL error' — the log line seen 60-120ms before each proven 500; it also treats a transient 429 as a reason to delete the merchant's live Shopify redirect
- `packages/functions/src/services/urlRedirectService.js:93` — the CREATE branch's catch stays inside Firestore, which is why ~400 CREATE 429s were swallowed and produced no 500
- `packages/functions/src/controllers/redirectController.js:451` — logger.error('[redirectController]', error.message) + ctx.status = 500 — the exact stderr line matching all 5 request 500s
- `packages/functions/src/controllers/redirectController.js:82` — const limit = pLimit(2) — 2 concurrent item chains against Shopify's 2 calls/sec REST bucket, so 429s are the steady state, not an anomaly
- `packages/functions/src/services/shopifyService.js:63` — initShopify defaults maxRetries: 0, so a 429 is surfaced to the caller instead of retried

## Evidence
- 5 matching entries: `(resource.labels.service_name="apigen2") AND timestamp>="2026-08-11T00:16:46Z" AND timestamp<="2026-08-11T00:46:46Z" AND httpRequest.status>=500`
- 5 matching entries: `(resource.labels.service_name="apigen2") AND timestamp>="2026-08-11T00:16:46Z" AND timestamp<="2026-08-11T00:46:46Z" AND textPayload:"[redirectController] Response code 429"`
- 124 matching entries: `(resource.labels.service_name="apigen2") AND timestamp>="2026-08-11T00:16:46Z" AND timestamp<="2026-08-11T00:46:46Z" AND textPayload:"UPDATE TARGET URL error"`
- 3 matching entries: `(resource.labels.service_name="apigen2") AND labels.execution_id="nxa3m5nh3a1v" AND timestamp<="2026-08-11T00:28:58.0Z"`
- 526 matching entries: `(resource.labels.service_name="apigen2") AND timestamp>="2026-08-11T00:16:00Z" AND timestamp<="2026-08-11T00:50:00Z" AND textPayload:"handleResolveRedirectSkipError"`

## Job
- analyze rounds: 1
- cost: $2.39
- MR: https://gitlab.com/avada/seo/-/merge_requests/2107

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
