fingerprint: 1q1aqq3
service: proxygen2
message: HTTP 500 GET /proxy/sitemap/products.xml
app: SEO
repo: seo
date: 2026-08-14T02:39:59.773Z
status: mr_open
attempt: 1

# SEO · proxygen2 · 1q1aqq3

**Outcome.** MR opened: https://gitlab.com/avada/seo/-/merge_requests/2195

**Root cause.** GET /proxy/sitemap/products.xml for roljo.myshopify.com returned 500 because getRedirectTracer's underlying library trace-redirect@1.0.6 creates its ClientRequest without an 'error' listener, so the DNS failure `getaddrinfo EAI_AGAIN www.happytoys.nl` (roljo's custom domain, reached by following the 301) was emitted as an unhandled EventEmitter 'error' that escaped every app-level try/catch and crashed the in-flight request via the functions-framework domain handler.

**Mechanism.** Request starts 17:40:19.341Z (Googlebot). getSitemapFile reads the shop + settings + sitemap docs, then at packages/functions/src/handlers/proxy/controllers/sitemapController.js:161 calls getRedirectTracer(`https://roljo.myshopify.com/`, 10000). getRedirectTracer (helpers/seoSpeed.js:105) races trace-redirect against delay(10000). trace-redirect follows roljo.myshopify.com's 301 to https://www.happytoys.nl/ (verified live: `curl -I https://roljo.myshopify.com/` -> 301 -> https://www.happytoys.nl/) and issues a second HEAD via node_modules/trace-redirect/release/get-header.js, which builds the request with http(s).request(options, callback) and calls req.end() with NO req.on('error', ...) — so the EAI_AGAIN from the resolver ~10s later is emitted on a ClientRequest with no error listener. Node turns that into an uncaught throw, which never reaches getRedirectTracer's catch (seoSpeed.js:106), getSitemapFile's catch (sitemapController.js:248) or the koa error middleware (handlers/proxy/clientApi.js:45-53); it is caught by the Cloud Functions gen2 domain wrapper, which prints `err.stack` bare to stderr (severity DEFAULT, no app prefix) and answers 500. Timing is exact: request start 17:40:19.341086Z + latency 11.088921476s = 17:40:30.430008Z; the stderr stack is at 17:40:30.430256Z on the same instance 001548f729e962bb… — 0.25 ms apart. Corroborating negatives: in 6h there is not one 'Cannot find redirect tracer' line, no '[getSitemapFile]' line, and in 2h no '[proxy] … 500' line — i.e. no app catch block ever saw this error, which is only possible if it bypassed them.

Confidence: `high`

## Code
- `packages/functions/src/handlers/proxy/controllers/sitemapController.js:161` — the products.xml branch of getSitemapFile calls getRedirectTracer(`https://${shopDomain}/`, 10000) — the only outbound network call on this route, and the one that resolves www.happytoys.nl
- `packages/functions/src/helpers/seoSpeed.js:105` — getRedirectTracer = Promise.race([tracer(url), delay(ms)]); the try/catch here (:106-108) can only see a promise rejection, not an EventEmitter 'error' emitted with no listener inside trace-redirect
- `packages/functions/src/handlers/proxy/controllers/sitemapController.js:248` — getSitemapFile's own catch would have logged '[getSitemapFile] …' and returned a 200 body; no such line exists in the window, proving the error never entered it
- `packages/functions/src/handlers/proxy/clientApi.js:45` — the koa error middleware that wraps the whole proxy router and logs '[proxy] <method> <path> 500 …'; zero such lines in 2h, so the 500 was not produced by koa
- `packages/functions/package.json:116` — pins trace-redirect 1.0.6, whose release/get-header.js builds http(s).request(...) and calls req.end() with no 'error' handler — the defect
- `packages/functions/src/handlers/exports/httpFunctions.js:100` — proxyGen2 declaration (timeoutSeconds 120, concurrency 2) — the 500 is not a timeout; it fired at 11.09s, far under the limit

## Evidence
- 1 matching entries: `(resource.labels.service_name="proxygen2") AND timestamp>="2026-08-13T17:40:19.000Z" AND timestamp<="2026-08-13T17:40:35.000Z" AND textPayload:"EAI_AGAIN"`
- 15 matching entries: `(resource.labels.service_name="proxygen2") AND timestamp>="2026-08-13T00:00:00Z" AND timestamp<="2026-08-14T00:00:00Z" AND httpRequest.status>=500`
- 15 matching entries: `(resource.labels.service_name="proxygen2") AND timestamp>="2026-08-13T17:40:28.000Z" AND timestamp<="2026-08-13T17:40:31.000Z"`
- 1 matching entries: `(resource.labels.service_name="proxygen2") AND timestamp>="2026-08-13T12:00:00Z" AND timestamp<="2026-08-13T18:00:00Z" AND (textPayload:"EAI_AGAIN" OR textPayload:"Cannot find redirect tracer" OR textPayload:"getSitemapFile")`

## Job
- analyze rounds: 1
- cost: $5.88
- branch: `fix/prod-seo-1q1aqq3`
- fix commit: `d9bbd57a969babe2df7ccf5035aa976f2ae7b4eb`
- MR: https://gitlab.com/avada/seo/-/merge_requests/2195
- tests: 1038 tests, 6 failing · baseline 6 failing · reproduce test fails without the fix

```
packages/functions/src/helpers/seoSpeed.js | 2 +-
 packages/functions/src/helpers/traceURL.js | 2 +-
 2 files changed, 2 insertions(+), 2 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
