fingerprint: 127fskk
service: proxygen2
message: HTTP 500 GET /proxy/sitemap/articles.xml
app: SEO
repo: seo
date: 2026-08-22T07:53:27.512Z
status: fix_disabled
attempt: 1

# SEO · proxygen2 · 127fskk

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** GET /proxy/sitemap/articles.xml for smokey-dealz.myshopify.com returned 500 because trace-redirect@1.0.6, invoked via getRedirectTracer, builds its redirect-hop ClientRequest with no 'error' listener, so a TLS socket reset (`read ECONNRESET`) on the second hop to the shop's primary domain smokey-dealz.de was emitted as an unhandled EventEmitter 'error' that bypassed every app-level try/catch and killed the in-flight request.

**Mechanism.** Bingbot (74.125.210.160) starts GET /proxy/sitemap/articles.xml?...&shop=smokey-dealz.myshopify.com at 2026-08-21T23:37:20.363152Z on proxygen2 instance 00a41e8c1d977157… (revision proxygen2-00340-sul). The articles.xml branch of getSitemapFile reads shop + settings + storefront sitemap docs, then at packages/functions/src/handlers/proxy/controllers/sitemapController.js:161 calls getRedirectTracer(`https://smokey-dealz.myshopify.com/`, 10000) — the only outbound network call on this route. getRedirectTracer (helpers/seoSpeed.js:109) races trace-redirect against delay(10000). smokey-dealz.myshopify.com answers 301 → https://smokey-dealz.de/ (verified live: `curl -I https://smokey-dealz.myshopify.com/` → `HTTP/2 301`, `location: https://smokey-dealz.de/`, `x-redirect-reason: primary_domain_redirection`), so trace-redirect issues a second HEAD over TLS to smokey-dealz.de through http(s).request(...)+req.end() with no req.on('error'). When that TLS socket was reset ~3.0s later the error was emitted on a listener-less ClientRequest; Node turned it into an uncaught throw that never reached getRedirectTracer's catch (seoSpeed.js:115, which would have logged 'Cannot find redirect tracer'), getSitemapFile's catch (sitemapController.js:248-249, which would have logged '[getSitemapFile] …' and answered 200), or the koa proxy error middleware (clientApi.js:52, which logs '[proxy] GET /sitemap/articles.xml 500 …'). The gen2 functions-framework wrapper caught it, printed err.stack bare to stderr (severity DEFAULT, no app prefix, 2 frames: TLSWrap.onStreamRead / TLSWrap.callbackTrampoline) and answered 500. Timing is exact: request start 23:37:20.363152Z + latency 3.623965155s = 23:37:23.987117Z; the bare stack lands at 23:37:23.987632Z on the same instanceId — 0.5 ms apart, same labels.execution_id 3la48fzkzhhw. The orphaned Promise.race survived the crash and logged its 10 s fallback at 23:37:30.948715Z under the SAME execution_id, which back-dates the tracer call to 23:37:20.948Z — i.e. 0.585 s of Firestore work, then 3.04 s inside trace-redirect before the reset. Corroborating negatives across the 30-min window: zero '[proxy] … 500' lines, zero 'Cannot find redirect tracer' lines, and the single '[getSitemapFile]' line is an unrelated read_markets scope warning at 23:32:45.785Z — so no app catch block ever saw this error. Note also that the 18 other ECONNRESETs that day on this service all carry the framework's 'Exception from a finished function:' prefix (post-response, harmless); this one does not, which is why it took the request down. Same defect, same call path and same file as already-recorded fingerprints 1q1aqq3 (products.xml, roljo.myshopify.com, DNS EAI_AGAIN) and 1abkxna (collections.xml, pom-pom-london.myshopify.com, DNS EAI_AGAIN) — MR https://gitlab.com/avada/seo/-/merge_requests/2195 open and unmerged; package.json still pins trace-redirect 1.0.6 and both seoSpeed.js:18 and traceURL.js:2 still import it raw.

Confidence: `high`

## Code
- `packages/functions/src/handlers/proxy/controllers/sitemapController.js:161` — articles.xml/collections.xml/pages.xml/products.xml branch of getSitemapFile calls getRedirectTracer(`https://${shopDomain}/`, 10000) — the only outbound network call on this route, the one that resolved smokey-dealz.de
- `packages/functions/src/helpers/seoSpeed.js:109` — getRedirectTracer = Promise.race([tracer(url), delay(ms)]); a try/catch here can only observe a promise rejection, never an EventEmitter 'error' emitted with no listener inside trace-redirect
- `packages/functions/src/handlers/proxy/controllers/sitemapController.js:249` — getSitemapFile's own catch logs '[getSitemapFile]' and returns a 200 body; the only such line in the window is an unrelated read_markets warning, proving the error never entered it
- `packages/functions/src/handlers/proxy/clientApi.js:52` — koa error middleware wrapping the whole proxy router logs '[proxy] <method> <path> 500 …'; zero such lines in the window, so koa did not produce this 500
- `packages/functions/package.json:116` — pins trace-redirect 1.0.6, whose redirect-hop request is built with http(s).request(...) + req.end() and no 'error' handler — the defect; MR 2195 has not landed
- `packages/functions/src/helpers/traceURL.js:2` — a second, duplicate copy of getRedirectTracer importing the same unguarded trace-redirect — any fix must cover both call sites
- `packages/functions/src/handlers/exports/httpFunctions.js:101` — proxyGen2 declared timeoutSeconds:120, concurrency:2 — 3.62s is not a timeout, and concurrency 2 means one uncaught error can take a co-tenant request with it

## Evidence
- 1 matching entries: `(resource.labels.service_name="proxygen2") AND timestamp>="2026-08-21T23:37:20Z" AND timestamp<="2026-08-21T23:37:25Z" AND textPayload:"ECONNRESET"`
- 2 matching entries: `(resource.labels.service_name="proxygen2") AND labels."execution_id"="3la48fzkzhhw" AND timestamp>="2026-08-21T23:30:00Z" AND timestamp<="2026-08-21T23:45:00Z"`
- 1 matching entries: `(resource.labels.service_name="proxygen2") AND timestamp>="2026-08-21T23:22:26Z" AND timestamp<="2026-08-21T23:52:26Z" AND httpRequest.status>=500`
- 1 matching entries: `(resource.labels.service_name="proxygen2") AND timestamp>="2026-08-21T23:22:26Z" AND timestamp<="2026-08-21T23:52:26Z" AND (textPayload:"getSitemapFile" OR textPayload:"Cannot find redirect tracer" OR textPayload:"[proxy]")`
- 19 matching entries: `(resource.labels.service_name="proxygen2") AND timestamp>="2026-08-21T00:00:00Z" AND timestamp<="2026-08-22T00:00:00Z" AND textPayload:"ECONNRESET"`

## Job
- analyze rounds: 1
- cost: $3.10

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
