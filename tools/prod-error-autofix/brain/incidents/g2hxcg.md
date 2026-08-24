fingerprint: g2hxcg
service: proxy
message: HTTP 504 GET /proxy/shop/blog
app: BLOG
repo: blogs
date: 2026-08-24T04:23:23.315Z
status: fix_disabled
attempt: 2

# BLOG · proxy · g2hxcg

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** GET /proxy/shop/blog hung for the proxy function's full 60s timeoutSeconds because validateAccessToken awaits veryShopifyDomain, whose node-fetch of https://<shop>/robots.txt is issued with no timeout and no AbortController, so a single stalled storefront/DNS response holds the request open until Cloud Run returns 504.

**Mechanism.** routes/proxy.js:20 mounts GET /proxy/shop/blog as validateAccessToken -> shopifyController.setClient. validateAccessToken.js:29 awaits veryShopifyDomain(shopifyDomain) inside a Promise.all. veryShopifyDomain.js:10 calls node-fetch on https://<shopifyDomain>/robots.txt with no `timeout` option and no abort signal — node-fetch v2 defaults to no timeout, so the await never settles while the socket stays open. The proxy function is declared timeoutSeconds: 60 (functions/http.js:61); the request log shows latency 60.000492569s, an exact match to that cap (P4), and the response was produced by the platform, not the handler. Confirming that: BLOG's logger emits `severity`, yet the whole 04:15-04:25Z window on service proxy contains 6 log entries, all of them run.googleapis.com/requests — zero application lines. Neither validateAccessToken's catch (line 47) nor setClient's catch (shopifyController.js:598) ever ran, so nothing threw; the request was still in flight when the platform cut it. Firestore, the only other await in the chain (getIntegrationKey, getShopByField), carries its own client deadline and would have thrown into those catches and logged at ERROR. The same caller (axios/0.19.2, the SEO integration) retried at 04:20:21.363754Z and got 200 in 0.418s, matching the 0.27-0.42s baseline of the other /proxy/shop/blog calls in the window — a transient upstream stall, not a bad shop or a code path that is always slow.

Confidence: `medium`

## Code
- `packages/functions/src/helpers/veryShopifyDomain.js:10` — fetch(`https://${shopifyDomain}/robots.txt`) with no timeout option and no AbortSignal — node-fetch v2 waits forever; the only unbounded await in this request's chain
- `packages/functions/src/middleware/validateAccessToken.js:29` — veryShopifyDomain is awaited on the request path of every /proxy/shop/blog call, inside Promise.all, so its hang is the request's hang
- `packages/functions/src/routes/proxy.js:20` — route registration proving GET /proxy/shop/blog runs validateAccessToken before shopifyController.setClient
- `packages/functions/src/functions/http.js:61` — proxy is declared timeoutSeconds: 60 — the limit the observed 60.000492569s latency matches
- `packages/functions/src/controllers/shopifyController.js:598` — setClient's catch logs via logger.error (severity=ERROR); its absence in the window shows the handler never threw and never completed

## Evidence
- 1 matching entries: `resource.labels.service_name="proxy" AND httpRequest.requestUrl:"/proxy/shop/blog" AND httpRequest.status>=500 AND timestamp>="2026-08-17T00:00:00Z"`
- 6 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-08-24T04:15:00Z" AND timestamp<="2026-08-24T04:25:00Z"`
- 3 matching entries: `resource.labels.service_name="proxy" AND httpRequest.requestUrl:"/proxy/shop/blog" AND httpRequest.status=200 AND timestamp>="2026-08-24T04:15:00Z" AND timestamp<="2026-08-24T04:25:00Z"`
- 1 matching entries: `resource.labels.service_name="proxy" AND timestamp>="2026-08-24T04:05:35.597Z" AND timestamp<="2026-08-24T04:35:35.597Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $1.63

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
