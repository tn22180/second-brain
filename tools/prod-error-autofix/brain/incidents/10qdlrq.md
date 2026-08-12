fingerprint: 10qdlrq
service: embedappgen2
message: HTTP 504 GET /embed/link-manager/redirect-404
app: SEO
repo: seo
date: 2026-08-12T10:41:34.834Z
status: mr_open
attempt: 1

# SEO · embedappgen2 · 10qdlrq

**Outcome.** duplicate of rkbjb7 — MR https://gitlab.com/avada/seo/-/merge_requests/2169

**Root cause.** embedAppGen2 renders every /embed* page by awaiting a single unguarded, un-timed node-fetch of https://seo.apps.avada.io/embed-template.html (packages/functions/src/handlers/embed.js:25); when that outbound hop stalls the handler blocks until Cloud Run kills the request at the function's default 60s timeout — embedAppGen2 is declared with no timeoutSeconds — producing 504s.

**Mechanism.** All 6 embedappgen2 5xx in the window are 504 with latency 60.000397258s / 59.999067250s / 59.999031436s / 60.000300762s / 60.001356431s / 60.000779457s — every one pinned to 60.000s, the gen2 onRequest default timeoutSeconds, because packages/functions/src/handlers/exports/httpFunctions.js:28 declares embedAppGen2 with memory/minInstances/region/vpc but no timeoutSeconds (apiGen2 right below it sets 540). All 6 land on one instance, 001548f72936c15e67548362def186b34e4846e7. On that same instance in the same window the same fetch failed *fast* 3 times instead of hanging, and those left stack traces: 04:52:40.418Z and 04:57:20.156Z 'FetchError: request to https://seo.apps.avada.io/embed-template.html failed, reason: Client network socket disconnected before secure TLS connection was established', 04:57:25.524Z 'FetchError: request to https://seo.apps.avada.io/embed-template failed, reason: read ECONNRESET' — all through /workspace/node_modules/node-fetch/lib/index.js:1501, i.e. the lib/ build of embed.js:25. (The two URL spellings are one call site: firebase.json:47 sets cleanUrls:true, so /embed-template.html 301s to /embed-template and node-fetch reports whichever leg of the redirect chain broke.) So the seo.apps.avada.io hop was unhealthy for that instance from 04:43 to 05:01; when the socket errored it surfaced as a 500 unhandledError, when it hung it surfaced as the alerted 504. node-fetch v2 applies no default timeout, so nothing bounds the hang, and there is no cache or fallback — this one fetch gates the HTML of every embed route (/embed, /embed/seo-audit, /embed/seo-audit/seoOnPage, /embed/link-manager/redirect-404).

Confidence: `high`

## Code
- `packages/functions/src/handlers/embed.js:25` — the single unguarded await fetch(`https://${appConfig.baseUrl}/embed-template.html`) on the render path of every /embed* route — no timeout, no retry, no cache, no fallback body
- `packages/functions/src/handlers/embed.js:20` — this is the only app.use handler; every embed URL, including the alerted /embed/link-manager/redirect-404, runs through it
- `packages/functions/src/handlers/exports/httpFunctions.js:28` — embedAppGen2 onRequest options omit timeoutSeconds, so the gen2 default 60s applies — the exact latency of all 6 504s
- `packages/functions/src/config/app.js:7` — baseUrl = APP_BASE_URL, which in prod is seo.apps.avada.io — the host named in the FetchError messages
- `firebase.json:47` — cleanUrls:true, why the same fetch is reported against both /embed-template.html and /embed-template

## Evidence
- 6 matching entries: `(resource.labels.service_name="embedappgen2" OR resource.labels.function_name="embedappgen2") AND timestamp>="2026-08-07T04:41:52.782Z" AND timestamp<="2026-08-07T05:11:52.782Z" AND httpRequest.status=504`
- 6 matching entries: `(resource.labels.service_name="embedappgen2" OR resource.labels.function_name="embedappgen2") AND timestamp>="2026-08-07T04:41:52.782Z" AND timestamp<="2026-08-07T05:11:52.782Z" AND textPayload:"embed-template"`
- 6 matching entries: `(resource.labels.service_name="embedappgen2" OR resource.labels.function_name="embedappgen2") AND timestamp>="2026-08-07T04:41:52.782Z" AND timestamp<="2026-08-07T05:11:52.782Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.09
- MR: https://gitlab.com/avada/seo/-/merge_requests/2169

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
