fingerprint: 1lwydlk
service: apigen2
message: The request failed because the instance failed the readiness check.
app: SEO
repo: seo
date: 2026-08-14T06:27:00.210Z
status: infra
attempt: 1

# SEO · apigen2 · 1lwydlk

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: a platform-side container-start fault in avada-seo/us-central1 during the 04:00–05:00Z hour on 2026-08-14 made apigen2 cold-start containers fail Cloud Run's 240s startup TCP probe, so 165 in-flight admin API requests were answered 503 'instance failed the readiness check' / 500 'instance could not start successfully' / 500 'no available instance'. Duplicate of fingerprint 16ubfhn (already recorded infra, no MR).

**Mechanism.** All 165 failed requests in the window ran on one revision, apigen2-00324-zab, spread over 31 distinct admin endpoints (POST /api/track-event 25, GET /api/analysis-count 17, GET /api/subscription 17, GET /api/settings 14, …) — no single handler, no shared param, so no request-path defect can explain the set. 146 of 165 carry latency 0s (request never reached a container) and the other 19 carry 241.12–246.12s, the 240s Cloud Run startup-probe deadline plus scheduling (P4: the latency identifies which limit fired). The errors read holds 42 copies of 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.' across 44 distinct instanceIds of that one revision — unchanged code failing to bind :8080 on 44 separate machines. apiGen2 is declared onRequest({timeoutSeconds: 540, memory: '2GiB', maxInstances: 200, concurrency: 3, minInstances: isProduction ? 3 : 0}) (packages/functions/src/handlers/exports/httpFunctions.js:40-51); minInstances 3 at concurrency 3 covers only 9 concurrent requests, so ordinary admin traffic above that scales out and every new instance in this window hit the fault — which is also why 31 requests got 'no available instance' (maxInstances 200 was nowhere near reached; there were no startable instances, not too many). Not this service: fleet-wide the same probe-failure line fired across 46 avada-seo services in the 04:00Z hour (authgen2 131, handleproderroralertgen2 88, onupdateshopgen2 77, apigen2 52, proxygen2 44, extensiongen2 31, embedappgen2 24, …) against just 2 entries in the whole 03:00Z hour — a bounded platform window already recorded under 16ubfhn, 1r74ll6, kjv3nd, muzsov, 1470mjt, 8g3u6t, e9i6k0, 1bwfmw9, 1mprni, pva4gd. P3 OOM ruled out: zero 'Memory limit' lines on apigen2 in the window despite the 2GiB declaration. The image itself boots — apigen2 logged 65 successful startup probes the same day, and the 128 stderr entries in the window are normal successful work ([upsertTranslationSubcollection] success 10518853583163 en at 04:41:40Z) from containers that did start. Blast radius: merchants in the embedded admin got failed page loads for ~22 minutes (04:14:36Z–04:36:11Z); the Koa handlers were never entered, so no partial writes.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:40` — apiGen2 export — the Cloud Run service whose cold starts failed the startup probe; all 165 failures are on its revision apigen2-00324-zab
- `packages/functions/src/handlers/exports/httpFunctions.js:47` — minInstances: isProduction ? 3 : 0 with concurrency 3 (line 46) warms only ~9 concurrent requests, so normal admin traffic scales out into the faulting cold-start path
- `packages/functions/src/handlers/exports/httpFunctions.js:43` — memory: '2GiB' — declared limit against which zero 'Memory limit' lines were logged, ruling out P3 OOM
- `packages/functions/src/handlers/exports/httpFunctions.js:50` — apiHandler.callback() — the Koa app never ran; the container died before listen(), which is why 31 distinct endpoints share one failure

## Evidence
- 165 matching entries: `(resource.labels.service_name="apigen2" OR resource.labels.function_name="apigen2" OR resource.labels.job_name="apigen2") AND timestamp>="2026-08-14T04:14:07.948Z" AND timestamp<="2026-08-14T04:44:07.948Z" AND httpRequest.status>=500`
- 200 matching entries: `(resource.labels.service_name="apigen2" OR resource.labels.function_name="apigen2" OR resource.labels.job_name="apigen2") AND timestamp>="2026-08-14T04:14:07.948Z" AND timestamp<="2026-08-14T04:44:07.948Z" AND severity>=ERROR`
- 578 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:00:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 2 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T03:00:00Z" AND timestamp<="2026-08-14T03:59:59Z" AND textPayload:"STARTUP TCP probe failed"`
- 65 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z" AND textPayload:"STARTUP TCP probe succeeded"`

## Job
- analyze rounds: 1
- cost: $1.17

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
