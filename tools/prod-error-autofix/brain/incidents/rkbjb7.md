fingerprint: rkbjb7
service: embedappgen2
message: HTTP 504 GET /embed/search-optimization/image-alt
app: SEO
repo: seo
date: 2026-08-12T10:22:44.413Z
status: mr_open
attempt: 1

# SEO · embedappgen2 · rkbjb7

**Outcome.** duplicate of g36b4r — MR https://gitlab.com/avada/seo/-/merge_requests/2169

**Root cause.** Duplicate of fingerprint 1wnpppy (MR https://gitlab.com/avada/seo/-/merge_requests/2169 open, unmerged — commit 2153bcb3da on branch fix/prod-seo-1wnpppy): packages/functions/src/handlers/embed.js:25 renders every /embed* page by awaiting one unbounded node-fetch of https://seo.apps.avada.io/embed-template.html, so a socket that degrades holds the request until embedAppGen2's 60s Cloud Run budget expires and Cloud Run returns 504.

**Mechanism.** embedAppGen2 is declared at packages/functions/src/handlers/exports/httpFunctions.js:28 with no timeoutSeconds, so it runs at the firebase-functions v2 default of 60s. Its only middleware (embed.js:20-29) does one blocking `await fetch(`https://${appConfig.baseUrl}/embed-template.html`)` per request for a static HTML shell; node-fetch v2's default timeout is 0 (never), and there is no retry and no in-process cache. firebase.json:47 sets `cleanUrls: true`, so Hosting 301s /embed-template.html → /embed-template and each render costs two TLS round trips to the same CDN — both URLs appear in the FetchError text. In this 30-minute window all 13 of 13 5xx were 504 with latency 59.999081905s–60.000923993s, i.e. the 60s default to the millisecond, and all 13 landed on the single instance 001548f72936c15e6754 pinned warm by `minInstances: 1` in prod (httpFunctions.js:31). That same instance served 193 × 200 in the same window, so the egress fault to seo.apps.avada.io is intermittent (13/206 = 6.3%), not a wedge — the code simply has nothing to bound it. The faster-failing variant of the same fault is visible in stderr: 8 `[unhandledError] GET /embed... 500 ... FetchError: request to https://seo.apps.avada.io/embed-template failed, reason: read ECONNRESET | Client network socket disconnected before secure TLS connection was established`. The alerted path /embed/search-optimization/image-alt is not special — it is 2 of the 13, alongside /embed/seo-audit, /embed/settings, /embed/performance/speed-up, /embed/seo-audit/seoOnPage and bare /embed; one cause, eight symptom paths.

Confidence: `high`

## Code
- `packages/functions/src/handlers/embed.js:25` — the single unbounded `await fetch(...embed-template.html)` every /embed* render blocks on — no timeout, no retry, no cache
- `packages/functions/src/handlers/embed.js:20` — app.use(async ctx => ...) — this fetch is the only middleware, so nothing else can complete the response
- `packages/functions/src/handlers/exports/httpFunctions.js:28` — embedAppGen2 onRequest options carry no timeoutSeconds → firebase-functions v2 default 60s, matching all 13 latencies
- `packages/functions/src/handlers/exports/httpFunctions.js:31` — minInstances: 1 in prod pins one warm instance, so a degraded-egress instance keeps serving instead of recycling
- `packages/functions/src/config/app.js:7` — baseUrl = APP_BASE_URL, the seo.apps.avada.io host named in every FetchError
- `firebase.json:47` — cleanUrls: true makes Hosting 301 /embed-template.html → /embed-template, doubling the TLS round trips per render

## Evidence
- 13 matching entries: `(resource.labels.service_name="embedappgen2") AND timestamp>="2026-08-07T02:34:32Z" AND timestamp<="2026-08-07T03:04:33Z" AND httpRequest.status>=500`
- 206 matching entries: `(resource.labels.service_name="embedappgen2") AND timestamp>="2026-08-07T02:34:32Z" AND timestamp<="2026-08-07T03:04:33Z" AND httpRequest.requestMethod!=""`
- 16 matching entries: `(resource.labels.service_name="embedappgen2") AND timestamp>="2026-08-07T02:34:32Z" AND timestamp<="2026-08-07T03:04:33Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $1.25
- MR: https://gitlab.com/avada/seo/-/merge_requests/2169

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
