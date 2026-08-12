fingerprint: pzbsf9
service: embedappgen2
message: HTTP 504 GET /embed/performance
app: SEO
repo: seo
date: 2026-08-12T10:10:12.872Z
status: mr_open
attempt: 1

# SEO · embedappgen2 · pzbsf9

**Outcome.** duplicate of 1wnpppy — MR https://gitlab.com/avada/seo/-/merge_requests/2169

**Root cause.** Duplicate of fingerprint 1wnpppy (MR https://gitlab.com/avada/seo/-/merge_requests/2169 open, unmerged — commit 2153bcb3da is only on branch fix/prod-seo-1wnpppy, not on master): packages/functions/src/handlers/embed.js:25 serves every /embed* page render by awaiting a single un-timeouted node-fetch v2 GET of https://seo.apps.avada.io/embed-template.html, so when that outbound socket degrades on the pinned minInstances:1 container the request burns embedAppGen2's full 60s Cloud Run budget and Cloud Run returns 504.

**Mechanism.** embedAppGen2 is declared at httpFunctions.js:28 with memory/minInstances/region/vpc but no timeoutSeconds, so it runs at the firebase-functions v2 default of 60s. Its only middleware (embed.js:20-29) does one blocking `await fetch(`https://${appConfig.baseUrl}/embed-template.html`)` per request for a ~9KB static HTML shell; node-fetch v2's default timeout is 0 (never), so a socket that neither completes nor resets holds the request open until Cloud Run kills it. All 9 httpRequest 5xx entries in the alert window are 504 with latency 59.999081905s-60.000923993s — the 60s default to the millisecond (P4). Every one of them carries instanceId=001548f72936c15e6754…, revision embedappgen2-00302-zuv: the single warm container pinned by `minInstances: appConfig.isProduction ? 1 : 0` (httpFunctions.js:31), which therefore never recycles away from its degraded egress state. The same instance emitted both stderr FetchErrors in the window, to the same URL (Firebase Hosting `cleanUrls: true` in firebase.json 301s /embed-template.html → /embed-template, which is why node-fetch reports the redirected URL): `read ECONNRESET` at 02:47:18.209 and `Client network socket disconnected before secure TLS connection was established` at 02:35:01.132 — one and the same fault, sometimes hanging to the 60s cap (504), sometimes failing fast. The fast-fail variant never reaches the 5xx sink: errorHandler.js:30 renders views/error.html on the non-JSON accept path without setting ctx.status, so those 2 requests (GET /embed/seo-audit/seoOnPage/product/9188848140530, GET /embed/performance) returned HTTP 200 with a broken error page. The alerted request, HTTP 504 GET /embed/performance, is 3 of the 9 (02:31:05.461, 02:32:44.140, 02:33:45.011).

Confidence: `high`

## Code
- `packages/functions/src/handlers/embed.js:25` — The blocking per-request outbound fetch of the static embed shell. No timeout option, no AbortController, no retry, no memoized copy — node-fetch v2 defaults to an infinite timeout, so a hung socket consumes the entire request budget.
- `packages/functions/src/handlers/exports/httpFunctions.js:28` — embedAppGen2's onRequest config declares memory/minInstances/region/vpc but no timeoutSeconds, so it runs at the firebase-functions v2 default 60s — the exact latency of all 9 observed 504s.
- `packages/functions/src/handlers/exports/httpFunctions.js:31` — minInstances: 1 in production pins one long-lived container. All 9 failures in the window landed on that one instance (001548f72936c15e6754…), which is never recycled out of its degraded egress state.
- `packages/functions/src/middleware/errorHandler.js:30` — The fast-fail (ECONNRESET / TLS-disconnect) variant renders views/error.html without setting ctx.status, so those failures return HTTP 200 and are invisible to the httpRequest.status>=500 alert sink — only the 504 half of this fault ever pages.

## Evidence
- 9 matching entries: `(resource.labels.service_name="embedappgen2") AND timestamp>="2026-08-07T02:17:25.290Z" AND timestamp<="2026-08-07T02:47:25.290Z" AND httpRequest.status=504`
- 9 matching entries: `(resource.labels.service_name="embedappgen2") AND timestamp>="2026-08-07T02:17:25.290Z" AND timestamp<="2026-08-07T02:47:25.290Z" AND httpRequest.status>=500`
- 4 matching entries: `(resource.labels.service_name="embedappgen2") AND timestamp>="2026-08-07T02:17:25.290Z" AND timestamp<="2026-08-07T02:47:25.290Z" AND textPayload:"embed-template"`
- 9 matching entries: `(resource.labels.service_name="embedappgen2" OR resource.labels.function_name="embedappgen2" OR resource.labels.job_name="embedappgen2") AND timestamp>="2026-08-07T02:17:25.290Z" AND timestamp<="2026-08-07T02:47:25.290Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.69
- MR: https://gitlab.com/avada/seo/-/merge_requests/2169

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
