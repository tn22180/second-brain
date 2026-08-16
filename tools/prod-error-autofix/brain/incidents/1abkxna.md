fingerprint: 1abkxna
service: proxygen2
message: HTTP 500 GET /proxy/sitemap/collections.xml
app: SEO
repo: seo
date: 2026-08-15T23:34:40.460Z
status: mr_open
attempt: 1

# SEO · proxygen2 · 1abkxna

**Outcome.** duplicate of 1q1aqq3 — MR https://gitlab.com/avada/seo/-/merge_requests/2195

**Root cause.** GET /proxy/sitemap/collections.xml for pom-pom-london.myshopify.com returned 500 because trace-redirect@1.0.6, called via getRedirectTracer, built its redirect-hop ClientRequest with no 'error' listener, so the DNS failure `getaddrinfo EAI_AGAIN pompomlondon.com` was emitted as an unhandled EventEmitter 'error' that bypassed every app-level try/catch and killed the in-flight request.

**Mechanism.** Googlebot (66.249.74.166) starts GET /proxy/sitemap/collections.xml?from=1nQuUPPvQyMGQPWr0Yt4&to=ZZuAT6UYruDH1w26nqaN&locale=en-de&shop=pom-pom-london.myshopify.com at 2026-08-15T23:24:34.447007Z on instance 001548f729e948a6ae58 (revision proxygen2-00322-dun). The collections.xml branch of getSitemapFile reads the shop, settings and sitemap docs from Firestore, then at packages/functions/src/handlers/proxy/controllers/sitemapController.js:161 calls getRedirectTracer(`https://pom-pom-london.myshopify.com/`, 10000) — the only outbound network call on this route. getRedirectTracer (helpers/seoSpeed.js:105) races trace-redirect against delay(10000). trace-redirect follows the shop's storefront redirect to the custom domain pompomlondon.com and issues the next hop through http(s).request(...)+req.end() with no req.on('error'), so when the resolver answered EAI_AGAIN the error was emitted on a listener-less ClientRequest. Node turned that into an uncaught throw, which never reached getRedirectTracer's catch (seoSpeed.js:106-108), getSitemapFile's catch (sitemapController.js:249, which would have logged '[getSitemapFile] …' and returned 200), or the koa proxy error middleware (clientApi.js:44-54, which would have logged '[proxy] GET /sitemap/collections.xml 500 …'); the gen2 functions-framework wrapper caught it, printed err.stack bare to stderr (severity DEFAULT, no app prefix, only 2 frames: node:dns:122:26 / node:internal/async_hooks:130:17) and answered 500. Timing is exact: request start 23:24:34.447007Z + latency 4.500529976s = 23:24:38.947537Z; the bare stack is at 23:24:38.947675Z on the same instance — 0.14 ms apart. In the 30-minute window the other 25 stderr lines are all unrelated '[get404PageByUrl] Migrated old doc …' and none is '[getSitemapFile]' or '[proxy]', i.e. no app catch block ever saw this error. 4.50s is far under the 10000 ms race and the 120 s timeoutSeconds, so this is neither the delay nor a platform timeout. Same defect and same call path as already-recorded fingerprint 1q1aqq3 (roljo.myshopify.com → www.happytoys.nl, products.xml branch, sitemapController.js:161), MR https://gitlab.com/avada/seo/-/merge_requests/2195 open and unmerged.

Confidence: `high`

## Code
- `packages/functions/src/handlers/proxy/controllers/sitemapController.js:161` — the collections.xml/products.xml/articles.xml/pages.xml branch of getSitemapFile calls getRedirectTracer(`https://${shopDomain}/`, 10000) — the only outbound network call on this route and the one that resolves pompomlondon.com
- `packages/functions/src/helpers/seoSpeed.js:105` — getRedirectTracer = Promise.race([tracer(url), delay(ms)]); its try/catch can only observe a promise rejection, never an EventEmitter 'error' emitted with no listener inside trace-redirect
- `packages/functions/src/handlers/proxy/controllers/sitemapController.js:249` — getSitemapFile's own catch logs '[getSitemapFile]' and returns a 200 body; no such line exists in the 30-minute window, proving the error never entered it
- `packages/functions/src/handlers/proxy/clientApi.js:44` — the koa error middleware wrapping the whole proxy router; it logs '[proxy] <method> <path> 500 …' at :51 — zero such lines in the window, so koa did not produce this 500
- `packages/functions/package.json:116` — pins trace-redirect 1.0.6, whose redirect-hop request is built with http(s).request(...) + req.end() and no 'error' handler — the defect
- `packages/functions/src/handlers/exports/httpFunctions.js:101` — proxyGen2 declared timeoutSeconds:120, concurrency:2 — the 4.50s failure is not a timeout, and concurrency 2 means one uncaught error can also take a co-tenant request with it

## Evidence
- 1 matching entries: `(resource.labels.service_name="proxygen2") AND timestamp>="2026-08-15T23:24:30Z" AND timestamp<="2026-08-15T23:24:45Z" AND textPayload:"EAI_AGAIN"`
- 1 matching entries: `(resource.labels.service_name="proxygen2") AND timestamp>="2026-08-15T23:10:38Z" AND timestamp<="2026-08-15T23:40:38Z" AND httpRequest.status>=500`
- 26 matching entries: `(resource.labels.service_name="proxygen2") AND timestamp>="2026-08-15T23:10:38Z" AND timestamp<="2026-08-15T23:40:38Z" AND logName:"stderr"`

## Job
- analyze rounds: 2
- cost: $4.90
- MR: https://gitlab.com/avada/seo/-/merge_requests/2195

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
