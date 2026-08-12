fingerprint: jkyzan
service: embedappgen2
message: HTTP 504 GET /embed/performance/speed-up/settings
app: SEO
repo: seo
date: 2026-08-12T10:29:07.292Z
status: mr_open
attempt: 1

# SEO · embedappgen2 · jkyzan

**Outcome.** duplicate of 1u3gkku — MR https://gitlab.com/avada/seo/-/merge_requests/2169

**Root cause.** embedAppGen2's only request handler awaits an unguarded, un-timed node-fetch of https://seo.apps.avada.io/embed-template.html; during an upstream brownout at 02:45–03:08Z that fetch either reset the socket (500) or hung past the function's default 60s Cloud Run timeout, producing the 14 504s including GET /embed/performance/speed-up/settings.

**Mechanism.** packages/functions/src/handlers/embed.js:25 renders every /embed* page by awaiting `fetch(`https://${appConfig.baseUrl}/embed-template.html`)` with no timeout, no AbortController, no retry and no cached copy — the response body IS the page. packages/functions/src/handlers/exports/httpFunctions.js:28 declares embedAppGen2 with memory/minInstances/region/vpc but NO `timeoutSeconds`, so firebase-functions/v2 leaves the Cloud Run default of 60s. In the window the upstream host (Firebase Hosting behind seo.apps.avada.io) misbehaved in two ways: fast socket failures — 7 stderr entries `FetchError: request to https://seo.apps.avada.io/embed-template failed, reason: read ECONNRESET` and `... reason: Client network socket disconnected before secure TLS connection was established` — which the errorHandler caught and turned into `[unhandledError] GET /embed... 500`; and slow/never-answering connections, which had nothing to catch: the await simply sat there until Cloud Run killed the request at exactly 60s (`The request has been terminated because it has reached the maximum request timeout`). That second class is the 504 in the alert. Confirmed by the absence of any application log line at the 504 timestamps — the fetch never settled, so no catch block ran. Same defect family already recorded as fingerprints 1wnpppy / ojo5a0 / id3n0l / 1u3gkku (MR https://gitlab.com/avada/seo/-/merge_requests/2169, branch fix/prod-seo-1wnpppy, verified NOT an ancestor of master — still unmerged, so prod still runs the unbounded fetch).

Confidence: `high`

## Code
- `packages/functions/src/handlers/embed.js:25` — the single unguarded `await fetch(https://${appConfig.baseUrl}/embed-template.html)` that every /embed* render blocks on — no timeout, no AbortController, no retry, no cache
- `packages/functions/src/handlers/embed.js:26` — `await embedData.text()` — the second unbounded await on the same upstream connection; a stalled body read also rides to the 60s kill
- `packages/functions/src/handlers/exports/httpFunctions.js:28` — embedAppGen2's onRequest options set memory/minInstances/region/vpc but omit timeoutSeconds, leaving the 60s Cloud Run default that every 504 latency matches to the millisecond (P4)
- `packages/functions/src/config/app.js:7` — `baseUrl: process.env.APP_BASE_URL` — resolves to seo.apps.avada.io in prod, the host named in every FetchError

## Evidence
- 14 matching entries: `(resource.labels.service_name="embedappgen2" OR resource.labels.function_name="embedappgen2") AND timestamp>="2026-08-07T02:38:43.732Z" AND timestamp<="2026-08-07T03:08:43.732Z" AND httpRequest.status>=500`
- 14 matching entries: `(resource.labels.service_name="embedappgen2" OR resource.labels.function_name="embedappgen2") AND timestamp>="2026-08-07T02:38:43.732Z" AND timestamp<="2026-08-07T03:08:43.732Z" AND logName:"stderr"`
- 14 matching entries: `(resource.labels.service_name="embedappgen2" OR resource.labels.function_name="embedappgen2") AND timestamp>="2026-08-07T02:38:43.732Z" AND timestamp<="2026-08-07T03:08:43.732Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.03
- MR: https://gitlab.com/avada/seo/-/merge_requests/2169

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
