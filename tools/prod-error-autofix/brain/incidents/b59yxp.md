fingerprint: b59yxp
service: proxygen2
message: The request has been terminated because it has reached the maximum request timeout. To change this limit, see <https://cloud.google.com/run/docs/configuring/request-timeout>
app: SEO
repo: seo
date: 2026-08-04T07:29:54.530Z
status: mr_open
attempt: 1

# SEO · proxygen2 · b59yxp

**Outcome.** duplicate of pgb7sh — MR https://gitlab.com/avada/seo/-/merge_requests/2117

**Root cause.** Duplicate of fingerprint pgb7sh (MR https://gitlab.com/avada/seo/-/merge_requests/2117 open, unmerged): validateAccessToken awaits veryShopifyDomain, which node-fetch v2 GETs https://<shop>/robots.txt with no timeout and follows redirects — uzdevk-ui.myshopify.com 301-redirects to fabzonefabindia.com, whose robots.txt never responds, so the middleware promise never settles and Cloud Run kills the request at proxyGen2's timeoutSeconds: 120.

**Mechanism.** GET /proxy/shop/blog is registered proxyRateLimit -> validateAccessToken -> shopifyController.setClient (routes/proxy.js:59). All 32 504s in the window have latency 119.989-120.001s, matching proxyGen2's declared timeoutSeconds: 120 (handlers/exports/httpFunctions.js:100) to the millisecond, so the request was killed by Cloud Run, not by any code path. The only unbounded await in the chain is Promise.all([getIntegrationKey, veryShopifyDomain]) at middleware/validateAccessToken.js:29; veryShopifyDomain (helpers/veryShopifyDomain.js:10) calls node-fetch ^2.6.7 fetch() with no timeout option and no AbortController, and node-fetch v2 has no default timeout — its catch can never fire on a hang. setClient itself cannot 504: it catches and answers 200 with success:false ('Shop not found, the shop must install the SEO app first' appears 11x in stderr in this same window), and validateAccessToken's own catch answers 500. 16 of the 32 504s carry referer seo.apps.avada.io/embed?...shop=uzdevk-ui.myshopify.com; the other 16 carry referer https://avada-blog-app.web.app/ (the Blog app calling this cross-app route, shop not in the referer). Re-probed live 2026-08-04: https://uzdevk-ui.myshopify.com/robots.txt returns 301 -> https://fabzonefabindia.com/robots.txt, and that URL returns nothing after 25s (curl exit 28). Second-order: proxyGen2 runs concurrency: 2 with no minInstances, so 32 requests pinned 120s each exhaust the warm slots — that is the single POST /proxy/save404 500 'The request was aborted because there was no available instance' at 06:58:51.165Z (latency 0s), a symptom, not a separate cause. Also NOT the cause of this alert: 68 '[initShopify] error Cannot read properties of null (reading id)' + 69 '[getMainThemeId] error ... reading theme' pairs in the window all stack to updateOvrList on POST /proxy/updateOvrList — a different endpoint, fast-failing, caught, answering 200. The fix in MR 2117 is not present in this worktree: helpers/veryShopifyDomain.js is still the unpatched 15-line version.

Confidence: `high`

## Code
- `packages/functions/src/helpers/veryShopifyDomain.js:10` — fetch(`https://${shopifyDomain}/robots.txt`) — node-fetch v2, no timeout, no AbortController, follows redirects. The await that never settles.
- `packages/functions/src/middleware/validateAccessToken.js:29` — veryShopifyDomain is awaited inside Promise.all on every proxy route behind this middleware, so one dead storefront blocks the whole request for its full Cloud Run budget.
- `packages/functions/src/routes/proxy.js:59` — GET /proxy/shop/blog — the alert's endpoint — is registered behind proxyRateLimit + validateAccessToken.
- `packages/functions/src/handlers/exports/httpFunctions.js:100` — proxyGen2 declared {memory: '1GiB', timeoutSeconds: 120, concurrency: 2} — the 120.000s cutoff that turns the hang into a 504, and the concurrency: 2 that turns 32 hangs into 'no available instance'.

## Evidence
- 32 matching entries: `resource.labels.service_name="proxygen2" AND timestamp>="2026-08-04T06:44:53.569Z" AND timestamp<="2026-08-04T07:14:53.569Z" AND httpRequest.status=504 AND httpRequest.requestUrl:"/proxy/shop/blog"`
- 33 matching entries: `resource.labels.service_name="proxygen2" AND timestamp>="2026-08-04T06:44:53.569Z" AND timestamp<="2026-08-04T07:14:53.569Z" AND httpRequest.status>=500`
- 1 matching entries: `resource.labels.service_name="proxygen2" AND timestamp>="2026-08-04T06:44:53.569Z" AND timestamp<="2026-08-04T07:14:53.569Z" AND httpRequest.status=500`
- 68 matching entries: `resource.labels.service_name="proxygen2" AND timestamp>="2026-08-04T06:44:53.569Z" AND timestamp<="2026-08-04T07:14:53.569Z" AND logName:"stderr" AND textPayload:"initShopify"`
- 11 matching entries: `resource.labels.service_name="proxygen2" AND timestamp>="2026-08-04T06:44:53.569Z" AND timestamp<="2026-08-04T07:14:53.569Z" AND logName:"stderr" AND textPayload:"Shop not found"`

## Job
- analyze rounds: 1
- cost: $1.53
- MR: https://gitlab.com/avada/seo/-/merge_requests/2117

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
