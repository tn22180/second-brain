fingerprint: 1esj5e
service: embedappgen2
message: HTTP 504 GET /embed
app: SEO
repo: seo
date: 2026-08-12T09:56:51.934Z
status: inconclusive
attempt: 1

# SEO · embedappgen2 · 1esj5e

**Outcome.** smoke gate reproduce_not_failing

**Root cause.** packages/functions/src/handlers/embed.js serves every /embed page render by awaiting a single node-fetch of https://seo.apps.avada.io/embed-template.html with no timeout, no retry and no cache, so when that Firebase Hosting fetch stalls the request runs past embedAppGen2's undeclared (default 60s) Cloud Run timeout and returns 504.

**Mechanism.** embedAppGen2 is declared at handlers/exports/httpFunctions.js:28 with memory/minInstances/region/vpc but no `timeoutSeconds`, so firebase-functions v2 applies the 60s default. Its only handler (handlers/embed.js:20-29) has exactly one await chain: fetch() of the static template (:25) then .text() (:26). node-fetch v2 has no default timeout, so a stalled upstream read blocks the whole request. All 4 504s in the alert window carry latency 59.998682s / 59.999631s / 60.000343s / 60.000358s — the 60s cap to the millisecond — with responseSize 72 and no application log line, because Cloud Run terminates the request before any catch runs. The same instance (001548f72936c15e6754…, the single minInstances:1 container serving all 67 requests in the window) logged 3 FetchError ECONNRESET pairs naming that exact URL at 01:49:02, 02:12:01 and 02:13:06Z — the reset variant of the same stalled upstream. Latency of the surviving 200s in the same window confirms upstream degradation rather than local CPU starvation: 13 of 63 successes took over 10s (max 46.99s) to serve one static HTML file. Secondary defect: the ECONNRESET variant does NOT surface as a 500 to the client — middleware/errorHandler.js:30 takes the non-JSON branch and calls ctx.render('error') without setting ctx.status, so Koa answers HTTP 200 with an error page; that is why the 24h request log holds 5 504s and zero 500s despite 6 ECONNRESET stderr lines. firebase.json:47 `cleanUrls: true` also makes the request cost two sequential Hosting round-trips (301 /embed-template.html -> /embed-template, which is why the error string names the extensionless URL), doubling the stall surface.

Confidence: `high`

## Code
- `packages/functions/src/handlers/embed.js:25` — The only blocking I/O in the handler: fetch(`https://${appConfig.baseUrl}/embed-template.html`) with no AbortController/timeout, no retry, no cache — one outbound HTTPS call per page render.
- `packages/functions/src/handlers/embed.js:26` — await embedData.text() — the second half of the same un-timeboxed read; the ECONNRESET stack lands on node-fetch's response stream.
- `packages/functions/src/handlers/exports/httpFunctions.js:28` — embedAppGen2 = onRequest({memory, minInstances, region, ...vpcSettings}) declares no timeoutSeconds, so the gen2 default 60s applies — the exact 60.000s latency of all 5 504s in 24h.
- `packages/functions/src/middleware/errorHandler.js:30` — Non-JSON branch renders the error view without assigning ctx.status, so the ECONNRESET failures answer 200 with an error page instead of 5xx — they never appear in httpRequest.status>=500.
- `firebase.json:47` — cleanUrls: true makes /embed-template.html a 301 to /embed-template, so each render is two sequential Hosting round-trips; the error message names the redirected URL.

## Evidence
- 4 matching entries: `(resource.labels.service_name="embedappgen2") AND timestamp>="2026-08-07T01:47:06.245Z" AND timestamp<="2026-08-07T02:17:06.245Z" AND logName:"requests" AND httpRequest.status>=500`
- 6 matching entries: `(resource.labels.service_name="embedappgen2") AND timestamp>="2026-08-07T01:47:06.245Z" AND timestamp<="2026-08-07T02:17:06.245Z" AND textPayload:"ECONNRESET"`
- 67 matching entries: `(resource.labels.service_name="embedappgen2") AND timestamp>="2026-08-07T01:47:06.245Z" AND timestamp<="2026-08-07T02:17:06.245Z" AND logName:"requests"`
- 5 matching entries: `(resource.labels.service_name="embedappgen2") AND timestamp>="2026-08-06T02:17:06Z" AND timestamp<="2026-08-07T02:17:06Z" AND logName:"requests" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $4.22
- tests: 927 tests, 6 failing · baseline 6 failing · reproduce check did not pass

```
packages/functions/src/handlers/embed.js           | 58 ++++++++++++++++++++--
 .../src/handlers/exports/httpFunctions.js          |  1 +
 packages/functions/src/middleware/errorHandler.js  |  1 +
 3 files changed, 56 insertions(+), 4 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
