fingerprint: 1dfzetm
service: proxygen2
message: HTTP 500 GET /proxy/html-sitemap/index
app: SEO
repo: seo
date: 2026-08-28T10:37:09.440Z
status: fix_disabled
attempt: 2

# SEO · proxygen2 · 1dfzetm

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** GET /proxy/html-sitemap/index for e129a4.myshopify.com returned 500 because trace-redirect@1.0.6, invoked via getRedirectTracer, builds its redirect-hop ClientRequest with no 'error' listener, so a TLS `read ECONNRESET` on the second hop to the shop's primary domain www.thefirstscent.com was emitted as a listener-less EventEmitter 'error' that bypassed every app try/catch and killed the in-flight request.

**Mechanism.** Request starts 2026-08-28T10:31:20.529015Z on proxygen2 instance 00a41e8c1d33eba3… (revision proxygen2-00350-sit), execution_id ctaa51e4nhzh, UA a Google-range crawler from 74.125.210.8. getLiquidSitemap reads shop + sitemap settings from Firestore, then at packages/functions/src/handlers/proxy/controllers/sitemapController.js:299 calls getRedirectTracer(`https://e129a4.myshopify.com`, 10000) — the first outbound network call on the route, before getAllHandleOfType. getRedirectTracer (helpers/seoSpeed.js:109) races trace-redirect against delay(10000). e129a4.myshopify.com answers 301 → https://www.thefirstscent.com/ (verified live: `curl -I https://e129a4.myshopify.com/` → `HTTP/2 301`, `location: https://www.thefirstscent.com/`, `x-redirect-reason: primary_domain_redirection`), so trace-redirect issues a second HEAD over TLS to www.thefirstscent.com through http(s).request(...)+req.end() with no req.on('error'). That socket was reset 2.774s later; Node emitted 'error' on a listener-less ClientRequest and turned it into an uncaught throw. It never became a promise rejection — proof: the orphaned Promise.race never settled and logged its 10s fallback at 10:31:30.556251Z under the SAME execution_id ctaa51e4nhzh, which back-dates the tracer call to 10:31:20.556Z, i.e. 27ms of Firestore work then 2.774s inside trace-redirect. So the error reached none of getRedirectTracer's catch (seoSpeed.js:116, would have logged 'Cannot find redirect tracer'), getLiquidSitemap's catch (sitemapController.js:412, would have logged '[getLiquidSitemap]' and answered 200), or the koa proxy error middleware (clientApi.js:52, would have logged '[proxy] GET /html-sitemap/index 500'). Zero lines of any of those three in the 30-minute window. The gen2 functions-framework wrapper caught it, printed err.stack bare to stderr (severity DEFAULT, no app prefix, 2 frames: TLSWrap.onStreamRead / TLSWrap.callbackTrampoline) and answered 500. Timing is exact: 10:31:20.529015Z + latency 2.801103061s = 10:31:23.330118Z; the bare stack lands at 10:31:23.330194Z — 76 microseconds apart, same instanceId, same execution_id. The discriminator is decisive: of 72 ECONNRESET stderr entries on proxygen2 in the 24h of 2026-08-28, 71 carry the framework's 'Exception from a finished function:' prefix (post-response, harmless — the 10 co-timestamped ones at 10:31:23.327–.332 belong to five other execution_ids' abandoned tracers) and exactly ONE is bare: this one, under this request's execution_id. Exactly one 500 on the service in the window. Same defect, same helper, same unguarded dependency as already-recorded fingerprints 127fskk (articles.xml), 1abkxna (collections.xml) and 1q1aqq3 (products.xml); new only in the call site — sitemapController.js:299 (getLiquidSitemap) rather than :161/:217 (getSitemapFile). MR 2195 is open and unmerged; packages/functions/package.json:116 still pins trace-redirect 1.0.6 and both seoSpeed.js:18 and traceURL.js:2 still import it raw.

Confidence: `high`

## Code
- `packages/functions/src/handlers/proxy/controllers/sitemapController.js:299` — getLiquidSitemap calls getRedirectTracer(`https://${shopDomain}`, 10000) — the first outbound call on /proxy/html-sitemap/:htmlPage and the one that resolved www.thefirstscent.com; a new call site for this defect family (127fskk cited :161)
- `packages/functions/src/helpers/seoSpeed.js:109` — getRedirectTracer = Promise.race([tracer(url), delay(ms)]); a try/catch here can only observe a promise rejection, never an EventEmitter 'error' emitted with no listener inside trace-redirect — and the race provably never settled (10s fallback logged at 10:31:30.556Z under the same execution_id)
- `packages/functions/src/handlers/proxy/controllers/sitemapController.js:412` — getLiquidSitemap's own catch logs '[getLiquidSitemap]' and answers 200 with {data:[],error}; zero such lines in the 30-min window, proving the error never entered it and that the 500 cannot have come from this handler
- `packages/functions/src/handlers/proxy/clientApi.js:52` — koa error middleware wrapping the whole proxy router logs '[proxy] <method> <path> 500 …'; zero such lines in the window, so koa did not produce this 500 either
- `packages/functions/package.json:116` — pins trace-redirect 1.0.6, whose redirect-hop request is built with http(s).request(...) + req.end() and no 'error' handler — the actual defect; MR 2195 has not landed
- `packages/functions/src/helpers/traceURL.js:2` — a second, duplicate copy of getRedirectTracer importing the same unguarded trace-redirect — any fix must cover both modules, not just seoSpeed.js
- `packages/functions/src/handlers/exports/httpFunctions.js:101` — proxyGen2 declared timeoutSeconds:120, concurrency:2 — 2.80s is nowhere near a timeout, and concurrency 2 means one uncaught socket error can also take a co-tenant request down

## Evidence
- 72 matching entries: `(resource.labels.service_name="proxygen2") AND timestamp>="2026-08-28T00:00:00Z" AND timestamp<="2026-08-29T00:00:00Z" AND textPayload:"ECONNRESET"`
- 3 matching entries: `(resource.labels.service_name="proxygen2") AND labels."execution_id"="ctaa51e4nhzh"`
- 1 matching entries: `(resource.labels.service_name="proxygen2") AND timestamp>="2026-08-28T10:16:42Z" AND timestamp<="2026-08-28T10:46:42Z" AND httpRequest.status>=500`
- 13 matching entries: `(resource.labels.service_name="proxygen2") AND timestamp>="2026-08-28T10:31:18Z" AND timestamp<="2026-08-28T10:31:35Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $3.54

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
