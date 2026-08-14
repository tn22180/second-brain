fingerprint: dw8unc
service: apigen2
message: HTTP 500 GET /api/redirects/history-import
app: SEO
repo: seo
date: 2026-08-14T10:17:47.654Z
status: infra
attempt: 1

# SEO · apigen2 · dw8unc

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: during the 2026-08-14T04:0x–05:0xZ prod deploy window of avada-seo, apigen2 containers repeatedly failed to bind :8080 within the Cloud Run startup probe (43 'Default STARTUP TCP probe failed' + revision apigen2-00325-woz declared not-Ready with 'Container Healthcheck failed'), so Cloud Run had no serving instance and aborted the alerted GET /api/redirects/history-import at admission — the handler never ran.

**Mechanism.** apiGen2 is declared minInstances:3, concurrency:3, maxInstances:200 (packages/functions/src/handlers/exports/httpFunctions.js:40). At 04:23:21.523Z and 04:24:10.339Z two GET /api/redirects/history-import requests on revision apigen2-00324-zab returned HTTP 500 with latency exactly 0s and textPayload 'The request was aborted because there was no available instance' — zero latency means Cloud Run rejected them before dispatch, so no Koa middleware, no route (packages/functions/src/routes/api.js:281) and no controller executed. Consistent with that: in the pulled 04:26–04:56Z window, 149 of 149 severity>=ERROR entries are platform-side (99 'The request failed because the instance could not start successfully', 43 'Default STARTUP TCP probe failed ... for container "worker" on port 8080. The instance was not started.', 3 readiness-check failures, 1 no-available-instance, 3 Cloud Functions audit events), and the 04:46:30–04:46:34Z audit records show UpdateFunction by tuannv@avadagroup.com failing with code 3 'Could not create or update Cloud Run service apigen2, Container Healthcheck failed. The user-provided container failed to start and listen on the port defined provided by the PORT=8080 environment variable'. stderr for the same window carries only ordinary application traffic ([upsertTranslationSubcollection], [updateAnalysis], [runner:audit], PageSpeed) — zero stack traces, zero module-load exceptions — so the container failure is not an app-code throw at import time. Same fault family already recorded for this project/date under fingerprints 5dup6h, q12jxx, 16ubfhn, 1lwydlk (apigen2) and ~50 other avada-seo services.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:40` — apiGen2 onRequest declaration — minInstances:3, concurrency:3, maxInstances:200; the instance pool Cloud Run could not fill during the deploy window
- `packages/functions/src/routes/api.js:281` — the alerted route GET /redirects/history-import; it exists and is healthy — it served HTTP 200 at 04:24:10.825Z, 04:52:55.250Z, 05:02:00.851Z, 05:25–05:59Z, so the handler is not implicated

## Evidence
- 2 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-14T04:20:00Z" AND timestamp<="2026-08-14T04:30:00Z" AND httpRequest.requestUrl:"history-import" AND httpRequest.status>=500`
- 43 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-14T04:26:17.106Z" AND timestamp<="2026-08-14T04:56:17.106Z" AND severity>=ERROR AND textPayload:"STARTUP TCP probe failed"`
- 99 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-14T04:26:17.106Z" AND timestamp<="2026-08-14T04:56:17.106Z" AND severity>=ERROR AND textPayload:"instance could not start successfully"`
- 2 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T06:00:00Z" AND protoPayload.status.message:"failed to start and listen"`
- 20 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T06:00:00Z" AND httpRequest.requestUrl:"history-import"`

## Job
- analyze rounds: 1
- cost: $1.81

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
