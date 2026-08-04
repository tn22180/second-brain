fingerprint: pgb7sh
service: proxygen2
message: HTTP 504 GET /proxy/shop/blog
app: SEO
repo: seo
date: 2026-08-04T07:10:44.600Z
status: mr_open
attempt: 1

# SEO · proxygen2 · pgb7sh

**Outcome.** MR opened: https://gitlab.com/avada/seo/-/merge_requests/2117

**Root cause.** validateAccessToken calls veryShopifyDomain, which does a node-fetch v2 GET of https://<shop>/robots.txt with no timeout and default redirect-following; for shop uzdevk-ui.myshopify.com that 301-redirects to fabzonefabindia.com, whose robots.txt never responds, so the middleware promise never settles and Cloud Run kills the request at proxyGen2's timeoutSeconds: 120 — every /proxy/shop/blog 504 in the window.

**Mechanism.** GET /proxy/shop/blog is routed proxyRateLimit -> validateAccessToken -> shopifyController.setClient (routes/proxy.js:59). proxyRateLimit cannot hang: redisCache.rateLimit is wrapped in try/catch and its ioredis client is built with connectTimeout 3000 / commandTimeout 1000 (helpers/redisCache.js:81,:85) and fails open — the three '[redisCache:*] Stream isn't writeable' stderr lines at 06:58:50 prove it returned rather than blocked. setClient catches everything and answers 200 with success:false ('Shop not found...' appears 3x in stderr), and validateAccessToken's own catch answers 500. So a 504 on this route can only be an await that never settles. The only unbounded await in the chain is Promise.all([getIntegrationKey, veryShopifyDomain]) at middleware/validateAccessToken.js:29; veryShopifyDomain (helpers/veryShopifyDomain.js:10) calls node-fetch ^2.6.7 fetch() with no timeout option and no AbortController, and node-fetch v2 has no default timeout. 12 of the 16 504s carry referer seo.apps.avada.io/embed?...shop=uzdevk-ui.myshopify.com. Probed live: https://uzdevk-ui.myshopify.com/robots.txt returns 301 -> https://fabzonefabindia.com/robots.txt, and that URL returns nothing after 40s (curl exit 28). node-fetch follows the 301 and hangs; the request sits until Cloud Run's timeoutSeconds: 120 (handlers/exports/httpFunctions.js:100), producing latencies of 119.989-120.001s — the configured limit to the millisecond. Second-order: proxyGen2 runs concurrency: 2 with no minInstances, so 16 requests pinned for 120s each occupy ~8 instance slots; that is why POST /proxy/save404 got 500 'The request was aborted because there was no available instance' at 06:58:51. That 500 is a symptom, not a separate cause. Separately and NOT the cause of this alert: 79 pairs of '[initShopify] error Cannot read properties of null (reading id)' + '[getMainThemeId] error ... reading theme' in the same window all stack to updateOvrList (controllers/seoController.js:1806-1808) on POST /proxy/updateOvrList — a different endpoint, fast-failing, caught, answering 200.

Confidence: `high`

## Code
- `packages/functions/src/helpers/veryShopifyDomain.js:10` — fetch(`https://${shopifyDomain}/robots.txt`) — node-fetch v2, no timeout, no AbortController, follows redirects. This is the await that never settles.
- `packages/functions/src/middleware/validateAccessToken.js:29` — veryShopifyDomain is awaited inside Promise.all on every proxy route guarded by this middleware, so one dead storefront blocks the whole request.
- `packages/functions/src/routes/proxy.js:59` — GET /proxy/shop/blog is registered behind proxyRateLimit + validateAccessToken — the alert's endpoint and the path to the hang.
- `packages/functions/src/handlers/exports/httpFunctions.js:100` — proxyGen2 declared timeoutSeconds: 120, concurrency: 2 — the 120.000s cutoff that turns the hang into a 504, and the concurrency that turns 16 hangs into 'no available instance'.
- `packages/functions/src/helpers/redisCache.js:85` — commandTimeout 1000ms plus the try/catch fail-open in rateLimit (:433-447) rules Redis out as the source of a 120s stall.

## Evidence
- 20 matching entries: `resource.labels.service_name="proxygen2" AND timestamp>="2026-08-04T06:43:29.790Z" AND timestamp<="2026-08-04T07:13:29.790Z" AND httpRequest.status=504 AND httpRequest.requestUrl:"/proxy/shop/blog"`
- 17 matching entries: `resource.labels.service_name="proxygen2" AND timestamp>="2026-08-04T06:43:29.790Z" AND timestamp<="2026-08-04T07:13:29.790Z" AND httpRequest.status>=500`
- 1 matching entries: `resource.labels.service_name="proxygen2" AND timestamp>="2026-08-04T06:43:29.790Z" AND timestamp<="2026-08-04T07:13:29.790Z" AND severity>=ERROR AND httpRequest.status=500`
- 3 matching entries: `resource.labels.service_name="proxygen2" AND timestamp>="2026-08-04T06:43:29.790Z" AND timestamp<="2026-08-04T07:13:29.790Z" AND logName:"stderr" AND textPayload:"redisCache"`
- 79 matching entries: `resource.labels.service_name="proxygen2" AND timestamp>="2026-08-04T06:43:29.790Z" AND timestamp<="2026-08-04T07:13:29.790Z" AND logName:"stderr" AND textPayload:"initShopify"`

## Job
- analyze rounds: 1
- cost: $3.76
- branch: `fix/prod-seo-pgb7sh`
- fix commit: `75d1984bdeae8903b1ef6aa6d1a0b0de92a024a6`
- MR: https://gitlab.com/avada/seo/-/merge_requests/2117
- tests: 789 tests, 5 failing · baseline 5 failing · reproduce test fails without the fix

```
packages/functions/src/helpers/veryShopifyDomain.js | 14 ++++++++++++--
 1 file changed, 12 insertions(+), 2 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
