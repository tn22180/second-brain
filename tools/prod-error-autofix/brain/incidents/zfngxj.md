fingerprint: zfngxj
service: apigen2
message: HTTP 500 GET /api/sitemaps/subSitemaps
app: SEO
repo: seo
date: 2026-09-02T08:10:23.186Z
status: fix_disabled
attempt: 1

# SEO · apigen2 · zfngxj

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** GET /api/sitemaps/subSitemaps returned 500 twice for the shop on custom domain allsaints.hk because trace-redirect@1.0.6, invoked via getRedirectTracer at sitemapController.js:141, builds its redirect-hop request with no 'error' listener, so the TLS failure `unable to get local issuer certificate` on https://allsaints.hk/ was emitted as a listener-less EventEmitter 'error' that bypassed every app-level try/catch and was turned into a 500 by the gen2 functions-framework request domain.

**Mechanism.** Both alerted 500s are GET https://apigen2-pihimpufva-uc.a.run.app/api/sitemaps/subSitemaps, referer https://seo.apps.avada.io/embed/indexing/sitemap, same instance 00a41e8c1d28521e699e (revision apigen2-00358-wol), at 08:04:49.474111Z (latency 0.520930151s) and 08:04:50.439109Z (latency 0.273328737s). subSitemaps (controllers/sitemapController.js:134) reads the shop and settings from Firestore, then at :141 makes its only outbound call to the merchant storefront: `(await getRedirectTracer('https://allsaints.hk/', 10000)).replace('/password','')`. getRedirectTracer (helpers/seoSpeed.js:103) races `tracer(url)` — trace-redirect 1.0.6, pinned at packages/functions/package.json:116 — against delay(10000). trace-redirect issues the hop through http(s).request(...) + req.end() with no req.on('error'), so when the TLS handshake to allsaints.hk failed chain validation the error was emitted on a listener-less ClientRequest. Node escalated it out-of-band: it never rejected the awaited promise, so it never reached getRedirectTracer's catch (seoSpeed.js:115, which would have logged 'Cannot find redirect tracer'), never reached subSitemaps' own catch (sitemapController.js:167, which logs 'Error subSitemaps:' and answers HTTP 200 with success:false), and never reached the koa error middleware (middleware/errorHandler.js:19, which logs '[unhandledError] GET /api/sitemaps/subSitemaps 500 …') or the app 'error' listener (handlers/api.js:77, '[api] …'). Zero lines with any of those four prefixes exist anywhere in the 30-minute window — the only stderr output is the bare stack itself, severity DEFAULT, no app prefix, frames TLSSocket.onConnectSecure (node:internal/tls/wrap:1787:34) → TLSSocket.emit (node:domain:552:15) → ssl.onhandshakedone: that is the functions-framework domain wrapper printing err.stack and answering 500 (responseSize 1023 on both). Timing is exact, twice: 08:04:49.474111 + 0.520930151 = 08:04:49.995041 vs bare stack at 08:04:49.998942 (3.9 ms); 08:04:50.439109 + 0.273328737 = 08:04:50.712438 vs bare stack at 08:04:50.712185 (0.25 ms). Proof the awaited race outlived the response: the same call's `delay(10000)` won 10 s later and logged '[getRedirectTracer] trace timed out, falling back to the input url https://allsaints.hk/ 10000' at 08:04:59.982148Z and 08:05:00.664221Z on the same instance — 9.98 s and 9.95 s after the respective crash prints, long after both requests had already been answered 500. Same defect, same library, same helper as recorded fingerprints 1q1aqq3 / 1abkxna / 127fskk / 1dfzetm (MR 2195, open and unmerged), which hit the proxygen2 sitemap branch with DNS EAI_AGAIN; this is the admin apigen2 caller of the same helper, failing on TLS instead of DNS.

Confidence: `high`

## Code
- `packages/functions/src/controllers/sitemapController.js:141` — the only outbound network call on GET /api/sitemaps/subSitemaps — getRedirectTracer(`https://${shopDomain}/`, 10000), which resolves allsaints.hk
- `packages/functions/src/helpers/seoSpeed.js:109` — Promise.race([tracer(url), delay(ms)]) — trace-redirect's listener-less 'error' event is not a promise rejection, so the race neither settles nor rejects; delay wins 10s later, which is why the timeout warn is logged after the 500
- `packages/functions/src/helpers/seoSpeed.js:115` — getRedirectTracer's catch can only observe a rejection; it logs 'Cannot find redirect tracer' — no such line exists in the window, proving the error never entered it
- `packages/functions/src/controllers/sitemapController.js:167` — subSitemaps' own catch logs 'Error subSitemaps:' and returns HTTP 200 {success:false}; zero such lines in the window, so a 500 could not have come from this handler's normal error path
- `packages/functions/src/middleware/errorHandler.js:19` — the koa catch-all logs '[unhandledError] <method> <path> 500 …' for every 5xx it produces; zero such lines in the window, so koa did not produce these 500s
- `packages/functions/src/handlers/api.js:77` — api.on('error') logs '[api] …' for anything koa emits; also absent, confirming the error escaped the koa app entirely
- `packages/functions/package.json:116` — pins trace-redirect 1.0.6, whose redirect hop is built with http(s).request(...) + req.end() and no 'error' handler — the defect itself

## Evidence
- 2 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-09-02T07:50:06.227Z" AND timestamp<="2026-09-02T08:20:06.227Z" AND httpRequest.status>=500`
- 2 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-09-02T08:04:45Z" AND timestamp<="2026-09-02T08:05:10Z" AND textPayload:"unable to get local issuer certificate"`
- 2 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-09-02T08:04:45Z" AND timestamp<="2026-09-02T08:05:10Z" AND textPayload:"allsaints.hk"`
- 138 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-09-02T07:50:06.227Z" AND timestamp<="2026-09-02T08:20:06.227Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $2.99

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
