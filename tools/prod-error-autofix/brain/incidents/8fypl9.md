fingerprint: 8fypl9
service: proxygen2
message: HTTP 504 GET /proxy/sitemap/index.xml
app: SEO
repo: seo
date: 2026-08-12T21:04:43.143Z
status: mr_open
attempt: 1

# SEO · proxygen2 · 8fypl9

**Outcome.** MR opened: https://gitlab.com/avada/seo/-/merge_requests/2183

**Root cause.** GET /proxy/sitemap/index.xml has no request-level deadline on its outbound calls — the Shopify Admin GraphQL shopLocales call it awaits is built by initShopify with no `timeout` option — so one stalled outbound socket held the request until proxyGen2's configured `timeoutSeconds: 120` fired and Cloud Run answered 504.

**Mechanism.** Request received 2026-08-12T15:14:54.205Z (shop bn1iub-30.myshopify.com, Googlebot) on instance 001548f7296e252a1ba61f60, killed at 120.000572301s — the exact value of `timeoutSeconds: 120` declared for proxyGen2 (httpFunctions.js:100). No stderr line exists for it, so no catch block ran: the handler was parked on an await, not throwing. getSitemapFile's index.xml branch awaits, in order, getShopByDomainCached → getSettings → getRedirectTracer → getShopLocalesHelper → Promise.all of 4 getSubSitemap Firestore reads. Every one of those is bounded except the Shopify call: the Redis client is built with commandTimeout 1000ms / connectTimeout 3000 / enableOfflineQueue false (redisCache.js:85), and getRedirectTracer is capped by Promise.race against delay(10000) (seoSpeed.js:105). getShopLocalesHelper (getShopLocals.js:9) issues shopLocalesGraphQL through the client initShopify returns, and initShopify calls `new Shopify({apiVersion, accessToken, shopName, autoLimit, maxRetries})` with no `timeout` (shopifyService.js:72) — shopify-api-node passes that straight to got, so with no timeout a connection that blackholes never rejects and the await never settles. Data volume and instance health are both excluded: the same shop's identical signed request (same App-Proxy timestamp=1786547694) was retried 60s later and returned 200 in 1.227s, and a third request for the same shop returned 200 in 1.524s on the SAME instance 2.3 minutes later; during the hung 120s that instance completed 240 other requests (113 save404 200s, 119 save404 429s, 3 updateOvrList, 2 other index.xml 200s), so the event loop was never blocked.

Confidence: `medium`

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:100` — proxyGen2 declared timeoutSeconds: 120 — the limit the 504's 120.000572301s latency matches to the millisecond
- `packages/functions/src/handlers/proxy/controllers/sitemapController.js:58` — the index.xml branch awaits getShopLocalesHelper(shop) inline in the request path, no deadline, no fallback
- `packages/functions/src/helpers/shopLocal/getShopLocals.js:9` — awaits shopLocalesGraphQL with no timeout and no retry wrapper — the unbounded await
- `packages/functions/src/services/shopifyService.js:72` — initShopify constructs shopify-api-node with no `timeout` option, so the underlying got request has no deadline
- `packages/functions/src/helpers/redisCache.js:85` — commandTimeout: 1000 (plus enableOfflineQueue:false, connectTimeout:3000) — eliminates Redis as the thing that could hang 120s
- `packages/functions/src/helpers/seoSpeed.js:105` — getRedirectTracer races tracer() against delay(ms), capping that call at 10s — eliminates the redirect trace as the stall
- `packages/functions/src/handlers/proxy/controllers/sitemapController.js:79` — the 4 getSubSitemap Firestore reads run only after the Shopify call resolves, so a stall there is upstream of all Firestore work

## Evidence
- 9 matching entries: `(resource.labels.service_name="proxygen2") AND timestamp>="2026-08-12T03:00:00Z" AND timestamp<="2026-08-13T03:00:00Z" AND httpRequest.status>=500`
- 3 matching entries: `(resource.labels.service_name="proxygen2") AND timestamp>="2026-08-12T03:00:00Z" AND timestamp<="2026-08-13T03:00:00Z" AND httpRequest.requestUrl:"bn1iub-30.myshopify.com"`
- 241 matching entries: `(resource.labels.service_name="proxygen2") AND timestamp>="2026-08-12T15:14:54Z" AND timestamp<="2026-08-12T15:16:55Z" AND labels.instanceId:"001548f7296e252a1ba61f60" AND httpRequest.status>=200`
- 24 matching entries: `(resource.labels.service_name="proxygen2") AND timestamp>="2026-08-12T15:00:00Z" AND timestamp<="2026-08-12T16:00:00Z" AND httpRequest.requestUrl:"/proxy/sitemap/index.xml"`
- 183 matching entries: `(resource.labels.service_name="proxygen2") AND timestamp>="2026-08-12T15:02:21.888Z" AND timestamp<="2026-08-12T15:32:21.888Z" AND logName:"stderr"`
- 61 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-12T03:00:00Z" AND timestamp<="2026-08-13T03:00:00Z" AND httpRequest.latency>="100s"`

## Job
- analyze rounds: 2
- cost: $9.81
- branch: `fix/prod-seo-8fypl9`
- fix commit: `20bcc6771ef0642ef74a710e20599b2a7c96965a`
- MR: https://gitlab.com/avada/seo/-/merge_requests/2183
- tests: 926 tests, 6 failing · baseline 6 failing · reproduce test fails without the fix

```
.../proxy/controllers/sitemapController.js         | 32 +++++++++++++++++++++-
 .../src/helpers/shopLocal/getShopLocals.js         |  3 +-
 packages/functions/src/services/shopifyService.js  |  8 ++++--
 3 files changed, 39 insertions(+), 4 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
