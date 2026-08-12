fingerprint: lkaxl2
service: embedappgen2
message: HTTP 504 GET /embed/seo-audit/seoOnPage/product/10504654127419
app: SEO
repo: seo
date: 2026-08-12T10:39:45.241Z
status: mr_open
attempt: 1

# SEO · embedappgen2 · lkaxl2

**Outcome.** duplicate of g36b4r — MR https://gitlab.com/avada/seo/-/merge_requests/2169

**Root cause.** Duplicate of fingerprint 1wnpppy (MR https://gitlab.com/avada/seo/-/merge_requests/2169 open, unmerged — master's embed.js:25 still has the bare fetch): embedAppGen2 renders every /embed* admin page by awaiting one unguarded node-fetch of https://seo.apps.avada.io/embed-template.html with no timeout, no retry and no fallback, so whenever that Hosting fetch stalls the request runs to embedAppGen2's default 60s Cloud Run timeout and returns 504.

**Mechanism.** packages/functions/src/handlers/embed.js:25 is the whole request handler: `await fetch(https://${appConfig.baseUrl}/embed-template.html)` then `.text()` then `ctx.body`. node-fetch is created with no `timeout` option, so it inherits the Node default of none. Firebase Hosting has `cleanUrls: true` (firebase.json:47), so that URL 301s to /embed-template and node-fetch follows — which is why the stderr traces name both spellings from the same instance. Two outcomes from the same call: (a) the socket stalls, nothing in the container ever returns, and Cloud Run cuts the request — embedAppGen2 is declared at packages/functions/src/handlers/exports/httpFunctions.js:28 with memory/minInstances/region/vpc but NO `timeoutSeconds`, so the gen2 default of 60s applies, and all 71 failing requests in 24h landed at 59.999–60.002s; (b) the socket resets fast (`read ECONNRESET`, `Client network socket disconnected before secure TLS connection was established`), the FetchError propagates to createErrorHandler, which logs `[unhandledError] GET /embed 500` and then falls into the non-JSON branch at packages/functions/src/middleware/errorHandler.js:30 and calls `ctx.render('error')` WITHOUT setting ctx.status — so the merchant gets an error page at HTTP 200 and it never appears in the request logs. That is why 24h of embedappgen2 request logs show 3691×200 / 1×404 / 71×504 and zero 500s, while stderr in the 30-minute alert window carries 4 `[unhandledError] ... 500` FetchError pairs.

Confidence: `high`

## Code
- `packages/functions/src/handlers/embed.js:25` — The single unguarded node-fetch on the critical path of every /embed* render — no timeout, no retry, no cached fallback.
- `packages/functions/src/handlers/exports/httpFunctions.js:28` — embedAppGen2 onRequest options declare memory/minInstances/region/vpc but no timeoutSeconds, so the gen2 default 60s fires — matching the observed 60.000s latencies.
- `packages/functions/src/middleware/errorHandler.js:30` — Non-JSON branch renders the error view without setting ctx.status, so the fast-fail FetchError variant is served as HTTP 200 and is invisible in request logs.
- `firebase.json:47` — cleanUrls:true makes Hosting redirect /embed-template.html → /embed-template, explaining both URL spellings in the stderr FetchErrors from one code path.

## Evidence
- 71 matching entries: `(resource.labels.service_name="embedappgen2") AND timestamp>="2026-08-07T00:00:00Z" AND timestamp<="2026-08-08T00:00:00Z" AND httpRequest.status>=500`
- 9 matching entries: `(resource.labels.service_name="embedappgen2") AND timestamp>="2026-08-07T04:00:00Z" AND timestamp<="2026-08-07T05:00:00Z" AND httpRequest.status>=400`
- 8 matching entries: `(resource.labels.service_name="embedappgen2") AND timestamp>="2026-08-07T04:10:19.346Z" AND timestamp<="2026-08-07T04:40:19.346Z" AND logName:"stderr"`
- 3763 matching entries: `(resource.labels.service_name="embedappgen2") AND timestamp>="2026-08-07T00:00:00Z" AND timestamp<="2026-08-08T00:00:00Z" AND httpRequest.status>0`

## Job
- analyze rounds: 1
- cost: $1.85
- MR: https://gitlab.com/avada/seo/-/merge_requests/2169

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
