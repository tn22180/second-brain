fingerprint: 1u3gkku
service: embedappgen2
message: HTTP 504 GET /embed/search-optimization/meta-rule
app: SEO
repo: seo
date: 2026-08-12T10:25:15.380Z
status: mr_open
attempt: 1

# SEO · embedappgen2 · 1u3gkku

**Outcome.** duplicate of rkbjb7 — MR https://gitlab.com/avada/seo/-/merge_requests/2169

**Root cause.** packages/functions/src/handlers/embed.js:25 renders every /embed* page by awaiting one node-fetch of https://seo.apps.avada.io/embed-template.html with no timeout, no retry and no cache, so when that Hosting round-trip stalls the request burns embedAppGen2's full 60s default timeout and Cloud Run answers 504.

**Mechanism.** embedAppGen2 (packages/functions/src/handlers/exports/httpFunctions.js:28) is declared with memory/minInstances/region only — no timeoutSeconds — so firebase-functions/v2 uses the 60s default. Its Koa app has exactly one middleware (embed.js:20-29) and exactly one awaited I/O: `await fetch(https://${appConfig.baseUrl}/embed-template.html)` at embed.js:25. node-fetch v2 has no default timeout, so a socket that never answers blocks the handler forever and Cloud Run kills the request at 60s. Between 02:45:14Z and 03:02:16Z the app's own Hosting origin was degraded for one warm instance (minInstances:1 in prod, so a single instance served everything): 14 of 14 stderr lines in the window are FetchError against that same URL — 'read ECONNRESET' and 'Client network socket disconnected before secure TLS connection was established' — and those are the requests where the socket failed fast (500). The 13 that hung instead of failing became 504s, every one of them at 59.999-60.001s, all on instance 001548f72936c1… revision embedappgen2-00302-zuv. The alerted path GET /embed/search-optimization/meta-rule appears on both sides: a 504 at 02:48:44.138Z and a 500 FetchError at 02:49:48.863Z, same fetch, same instance. firebase.json:47 sets cleanUrls:true, so the .html URL 301-redirects to /embed-template and node-fetch follows it — each page render costs two TLS round-trips to the same degraded origin, doubling exposure. VPC is ruled out: vpcSettings is PRIVATE_RANGES_ONLY (packages/functions/src/config/vpcSettings.js:15), so this public egress never touches the connector.

Confidence: `high`

## Code
- `packages/functions/src/handlers/embed.js:25` — the single un-timeout'd, un-retried, un-cached node-fetch that every /embed* render awaits — the only I/O in the handler
- `packages/functions/src/handlers/embed.js:20` — the sole app.use middleware: nothing else can hold the request open
- `packages/functions/src/handlers/exports/httpFunctions.js:28` — embedAppGen2 onRequest declares memory/minInstances/region but no timeoutSeconds, so the gen2 default 60s is what the 59.999-60.001s latencies matched
- `packages/functions/src/config/app.js:7` — baseUrl = APP_BASE_URL, i.e. seo.apps.avada.io — the fetch target is the app's own Firebase Hosting, a self-referential dependency
- `packages/functions/src/config/vpcSettings.js:15` — PRIVATE_RANGES_ONLY egress rules the VPC connector out as the cause of the public-egress ECONNRESETs

## Evidence
- 13 matching entries: `resource.labels.service_name="embedappgen2" AND timestamp>="2026-08-07T02:35:33.644Z" AND timestamp<="2026-08-07T03:05:33.644Z" AND httpRequest.status=504`
- 14 matching entries: `resource.labels.service_name="embedappgen2" AND timestamp>="2026-08-07T02:35:33.644Z" AND timestamp<="2026-08-07T03:05:33.644Z" AND logName:"stderr" AND textPayload:"embed-template"`
- 1 matching entries: `resource.labels.service_name="embedappgen2" AND timestamp>="2026-08-07T02:35:33.644Z" AND timestamp<="2026-08-07T03:05:33.644Z" AND logName:"stderr" AND textPayload:"meta-rule"`

## Job
- analyze rounds: 1
- cost: $1.43
- MR: https://gitlab.com/avada/seo/-/merge_requests/2169

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
