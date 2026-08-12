fingerprint: q2v3no
service: embedappgen2
message: HTTP 504 GET /embed/seo-audit
app: SEO
repo: seo
date: 2026-08-12T10:30:31.786Z
status: mr_open
attempt: 1

# SEO · embedappgen2 · q2v3no

**Outcome.** duplicate of pzbsf9 — MR https://gitlab.com/avada/seo/-/merge_requests/2169

**Root cause.** embedAppGen2 renders every /embed* admin page by awaiting a single unguarded node-fetch of https://seo.apps.avada.io/embed-template.html (packages/functions/src/handlers/embed.js:25) with no timeout, retry or cached copy, so when that HTTPS call resets or hangs the page render fails: 9/9 requests in the window died — the hangs at the function's own default 60s timeout (504), the resets as FetchError 500s.

**Mechanism.** GET /embed/seo-audit hits the single Koa middleware in packages/functions/src/handlers/embed.js:20. Line 25 does `await fetch(https://${appConfig.baseUrl}/embed-template.html)` — node-fetch, no `timeout` option, no retry, no fallback body; the response is the entire page body (:26-28). appConfig.baseUrl is APP_BASE_URL = seo.apps.avada.io (packages/functions/src/config/app.js:7). During the window that upstream connection failed two ways. (a) Socket dies fast: node-fetch rejects with `FetchError: ... read ECONNRESET` / `Client network socket disconnected before secure TLS connection was established`; the rejection propagates to createErrorHandler (packages/functions/src/middleware/errorHandler.js:16) which logs `[unhandledError] GET /embed/... 500` — 9 such pairs in stderr. (b) Socket hangs open: nothing bounds the await, so the request runs until Cloud Run kills it — embedAppGen2 is declared at packages/functions/src/handlers/exports/httpFunctions.js:28 with memory/minInstances/region but NO timeoutSeconds, so it inherits the gen2 default of 60s. All 9 request-log entries are 504 GET with latency 59.999819592s–60.001267905s, i.e. the 60s default to the millisecond (P4). Same single dependency, two symptom classes, five distinct /embed* paths.

Confidence: `high`

## Code
- `packages/functions/src/handlers/embed.js:25` — the unguarded await fetch of the remote embed-template.html — no timeout option, no retry, no cached/local fallback; this is the only I/O on the render path
- `packages/functions/src/handlers/embed.js:20` — the handler is one middleware whose whole body depends on that fetch, so every /embed* path fails identically
- `packages/functions/src/handlers/exports/httpFunctions.js:28` — embedAppGen2 is declared with no timeoutSeconds → gen2 default 60s, which the nine 504 latencies match exactly
- `packages/functions/src/config/app.js:7` — baseUrl = process.env.APP_BASE_URL, resolving to seo.apps.avada.io in prod — the host named in the FetchError
- `packages/functions/src/middleware/errorHandler.js:16` — logs the rejection as '[unhandledError] GET /embed/... 500', the exact stderr line seen 9 times

## Evidence
- 9 matching entries: `(resource.labels.service_name="embedappgen2" OR resource.labels.function_name="embedappgen2") AND timestamp>="2026-08-07T02:47:17.947Z" AND timestamp<="2026-08-07T03:17:17.947Z" AND httpRequest.status>=500`
- 18 matching entries: `(resource.labels.service_name="embedappgen2" OR resource.labels.function_name="embedappgen2") AND timestamp>="2026-08-07T02:47:17.947Z" AND timestamp<="2026-08-07T03:17:17.947Z" AND logName:"stderr"`
- 9 matching entries: `(resource.labels.service_name="embedappgen2" OR resource.labels.function_name="embedappgen2") AND timestamp>="2026-08-07T02:47:17.947Z" AND timestamp<="2026-08-07T03:17:17.947Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $0.91
- MR: https://gitlab.com/avada/seo/-/merge_requests/2169

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
