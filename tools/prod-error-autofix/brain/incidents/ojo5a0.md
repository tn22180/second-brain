fingerprint: ojo5a0
service: embedappgen2
message: HTTP 504 GET /embed/settings
app: SEO
repo: seo
date: 2026-08-12T10:20:38.568Z
status: mr_open
attempt: 1

# SEO · embedappgen2 · ojo5a0

**Outcome.** duplicate of pzbsf9 — MR https://gitlab.com/avada/seo/-/merge_requests/2169

**Root cause.** packages/functions/src/handlers/embed.js:25 renders every /embed* page by awaiting a single node-fetch of https://<APP_BASE_URL>/embed-template.html with no timeout, no retry and no cache, so when that outbound call to Firebase Hosting hangs the request burns embedAppGen2's default 60s timeout and Cloud Run returns 504.

**Mechanism.** embedAppGen2 (packages/functions/src/handlers/exports/httpFunctions.js:28) is declared with memory/minInstances/vpc but NO timeoutSeconds, so it inherits the gen2 default of 60s. Its only middleware (embed.js:20-28) does `await fetch(https://${appConfig.baseUrl}/embed-template.html)` before writing any body; node-fetch has no default timeout. In the window the egress to seo.apps.avada.io was unhealthy: stderr carries 8 FetchError pairs — 'read ECONNRESET' and 'Client network socket disconnected before secure TLS connection was established' — logged as [unhandledError] GET /embed... 500. The same fault in its hanging form produces the 504s: all 14 httpRequest entries with status>=500 have latency 59.999405–60.000923s, i.e. the 60s function timeout to the millisecond (P4), and all 14 are the same instance 001548f72936c15e… (the minInstances:1 warm instance). The alerted GET /embed/settings is one of them (02:46:43.767569Z, 60.000923993s), and the same path also appears in the fast-fail form at 02:48:01.433625Z. Both URL spellings in stderr ('/embed-template' and '/embed-template.html') are one call site: firebase.json hosting has cleanUrls:true, so the .html URL 301s to the extensionless one and node-fetch reports the followed URL. Path does not matter — embed.js has a single catch-all middleware, so /embed, /embed/settings, /embed/seo-audit, /embed/performance/speed-up all execute the identical fetch, which is why 7 distinct paths fail with one signature.

Confidence: `high`

## Code
- `packages/functions/src/handlers/embed.js:25` — the un-timeouted, un-retried, un-cached node-fetch of the embed template that every embed page render awaits
- `packages/functions/src/handlers/embed.js:20` — single catch-all middleware — all /embed* paths run the same fetch, explaining 7 different paths with one failure signature
- `packages/functions/src/handlers/exports/httpFunctions.js:28` — embedAppGen2 declared with no timeoutSeconds, so the default 60s is the ceiling the 504s hit exactly
- `packages/functions/src/handlers/exports/httpFunctions.js:64` — sibling function in the same file that does set timeoutSeconds: 60 explicitly — shows the option is available and omitted for embedAppGen2

## Evidence
- 14 matching entries: `(resource.labels.service_name="embedappgen2" OR resource.labels.function_name="embedappgen2") AND timestamp>="2026-08-07T02:31:59.305Z" AND timestamp<="2026-08-07T03:01:59.305Z" AND httpRequest.status>=500`
- 16 matching entries: `(resource.labels.service_name="embedappgen2" OR resource.labels.function_name="embedappgen2") AND timestamp>="2026-08-07T02:31:59.305Z" AND timestamp<="2026-08-07T03:01:59.305Z" AND logName:"stderr"`
- 14 matching entries: `(resource.labels.service_name="embedappgen2" OR resource.labels.function_name="embedappgen2") AND timestamp>="2026-08-07T02:31:59.305Z" AND timestamp<="2026-08-07T03:01:59.305Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.18
- MR: https://gitlab.com/avada/seo/-/merge_requests/2169

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
