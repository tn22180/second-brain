fingerprint: hc5yx9
service: embedappgen2
message: HTTP 504 GET /embed/seoOnPage/collection/465749999840
app: SEO
repo: seo
date: 2026-08-12T10:32:34.207Z
status: mr_open
attempt: 1

# SEO · embedappgen2 · hc5yx9

**Outcome.** duplicate of pzbsf9 — MR https://gitlab.com/avada/seo/-/merge_requests/2169

**Root cause.** packages/functions/src/handlers/embed.js:25 serves every /embed* page by awaiting a single node-fetch of https://seo.apps.avada.io/embed-template.html with no timeout, no retry and no cache, so when that upstream TLS connect fails/hangs the handler blocks past embedAppGen2's default 60s Cloud Run timeout and Cloud Run returns 504.

**Mechanism.** embedAppGen2 is declared at packages/functions/src/handlers/exports/httpFunctions.js:28 with memory/minInstances/region/vpc but NO timeoutSeconds, so firebase-functions v2 onRequest uses the 60s default (every other HTTP fn in that file sets 540 explicitly, e.g. apiGen2 at :41). Its only middleware (embed.js:20) awaits fetch(`https://${appConfig.baseUrl}/embed-template.html`) at :25 — bare node-fetch, no AbortController/timeout, no retry, no fallback body. During 04:15–04:29Z the upstream seo.apps.avada.io connection was failing: stderr carries 4 FetchErrors ('Client network socket disconnected before secure TLS connection was established' ×2, 'read ECONNRESET' ×2), all on the same instance 001548f72936c1 as the 504s. node-fetch's socket keeps waiting, so Cloud Run kills the request at exactly 60.000s and emits 504; the FetchError only surfaces 14–75s later (504 04:16:42 → FetchError for the same path GET /embed/seoOnPage/collection/465749999840 at 04:16:57), which is why errorHandler.js's [unhandledError] 500 line and the 504 request log never line up 1:1. All 4 504s in the window carried latency 60.000031–60.000432s — the configured limit to the millisecond (P4).

Confidence: `high`

## Code
- `packages/functions/src/handlers/embed.js:25` — bare `await fetch(https://${appConfig.baseUrl}/embed-template.html)` — no timeout, no retry, no cached fallback; it is the only awaited I/O on the whole /embed* path
- `packages/functions/src/handlers/embed.js:20` — single catch-all middleware: every /embed* URL (/embed, /embed/performance, /embed/seoOnPage/collection/:id, /embed/seo-audit/...) runs that one fetch, which is why 4 different paths 504 identically
- `packages/functions/src/handlers/exports/httpFunctions.js:28` — embedAppGen2 onRequest options set memory/minInstances/region/vpc but omit timeoutSeconds → gen2 default 60s, matching the observed 60.000s latencies
- `packages/functions/src/handlers/exports/httpFunctions.js:41` — apiGen2 sets timeoutSeconds: 540 in the same file — proves the omission on embedAppGen2 is the default, not an intentional 60s budget
- `packages/functions/src/middleware/errorHandler.js:18` — the [unhandledError] GET /embed 500 stderr lines come from here when the fetch finally rejects after the request was already cut at 60s

## Evidence
- 4 matching entries: `(resource.labels.service_name="embedappgen2") AND timestamp>="2026-08-07T04:01:59.767Z" AND timestamp<="2026-08-07T04:31:59.767Z" AND httpRequest.status=504`
- 8 matching entries: `(resource.labels.service_name="embedappgen2") AND timestamp>="2026-08-07T04:01:59.767Z" AND timestamp<="2026-08-07T04:31:59.767Z" AND textPayload:"embed-template"`
- 4 matching entries: `(resource.labels.service_name="embedappgen2") AND timestamp>="2026-08-07T04:01:59.767Z" AND timestamp<="2026-08-07T04:31:59.767Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $1.25
- MR: https://gitlab.com/avada/seo/-/merge_requests/2169

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
