fingerprint: q12jxx
service: apigen2
message: The request was aborted because there was no available instance. Additional troubleshooting documentation can be found at: <https://cloud.google.com/run/docs/troubleshooting#abort-request>
app: SEO
repo: seo
date: 2026-08-14T07:41:33.511Z
status: infra
attempt: 1

# SEO · apigen2 · q12jxx

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: a platform-side container-filesystem/startup fault in avada-seo/us-central1 during 2026-08-14T04:09–04:46Z made apigen2 containers fail to read their own deployed bundle (EIO on readFileSync inside the CJS loader) and never bind :8080, so Cloud Run answered 162 in-flight requests with 500/503 including the alerted 'no available instance'.

**Mechanism.** Every alerted request carries a Cloud Run platform textPayload, never an application error: 114× 'The request failed because the instance could not start successfully.', 31× 'The request was aborted because there was no available instance.', 16× 'The request failed because the instance failed the readiness check.' — 145 of 162 have no instanceId at all, i.e. they never reached a container. All 162 are on the currently-serving revision apigen2-00324-zab, spread over 25 distinct endpoints (/api/track-event 25, /api/subscription 17, /api/analysis-count 16, /api/settings 13, …), which rules out any single handler. The varlog/system read shows 45 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080 … Connection failed with status DEADLINE_EXCEEDED' on 43× apigen2-00324-zab and 2× apigen2-00325-woz — the OLD serving revision fails to start just as the new one does, so it is not new code. The one application-side line explaining why is at 04:26:11.500271Z on instance 001548f729bcf904: 'Detailed stack trace: Error: EIO: i/o error, read' thrown from node:fs readFileSync → defaultLoadImpl → loadSource inside the CJS module loader, on the require chain /workspace/lib/services/lightHouseService.js:18 → /workspace/lib/helpers/seoSpeed.js:25 (src: services/lightHouseService.js:9 importing helpers/seoSpeed). An EIO reading the immutable /workspace bundle is a container-filesystem fault, not a code defect — the same file loads fine on the instances that did start (stderr shows normal [runner:audit], [getGooglePageSpeedScore], [upsertTranslationSubcollection] traffic on 001548f729c81e51 / 001548f72988530c throughout the window). The fault is fleet-wide, not apigen2-specific: the identical 'EIO: i/o error' appears on 9 other services in the same hour (authgen2, embedappgen2, onupdateshopgen2, changelogtriggers-shops, changelogtriggers-shopinfos, extensiongen2, handleproderroralertgen2, handleprocessinternallinkreportgen2), and 'Container Healthcheck failed' audit entries fire for ≥10 distinct functions between 04:36Z and 04:46Z. The same fault killed a manual deploy: UpdateFunction on apiGen2 by tuannv@avadagroup.com failed at 04:46:34.030Z with code 3 'Could not create or update Cloud Run service apigen2, Container Healthcheck failed … failed to start and listen on the port … PORT=8080' for revision apigen2-00325-woz. Baseline confirms it is a discrete event: zero 'EIO: i/o error' entries across all cloud_run_revision logs in avada-seo in the preceding 24h (2026-08-13T04:00Z→2026-08-14T04:00Z). apiGen2 runs minInstances:3 / concurrency:3 / maxInstances:200 in prod, so with only 3 warm instances and 3 concurrent requests each, any container the platform cannot start immediately pushes overflow onto autoscaling — which is exactly what was failing. maxInstances was never the constraint. This is the same platform fault already recorded for this hour under fingerprints 16ubfhn and 1lwydlk (apigen2), 1i16r90/1r74ll6 (extensiongen2), 1470mjt/1e908f9 (authgen2), e9i6k0 (embedappgen2), 8g3u6t/1bpp1pw (onupdateshopgen2), pva4gd/1mprni (changelogtriggers-shops) — all closed as infra with no MR.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:47` — apiGen2 runs minInstances: 3 in prod — only 3 warm containers, so any platform failure to start a 4th surfaces as 500 'instance could not start successfully' on ordinary traffic
- `packages/functions/src/handlers/exports/httpFunctions.js:46` — concurrency: 3 — 3 warm instances serve only 9 concurrent requests before autoscaling is required, and autoscaling was what the platform fault broke
- `packages/functions/src/services/lightHouseService.js:9` — the require edge in the EIO stack: lib/services/lightHouseService.js:18 requiring lib/helpers/seoSpeed.js — the module read that returned EIO during container boot
- `packages/functions/src/helpers/seoSpeed.js:1` — the module whose own require chain hit 'EIO: i/o error, read' in readFileSync at 04:26:11.500Z — a filesystem read of the deployed bundle, nothing in the code itself

## Evidence
- 162 matching entries: `(resource.labels.service_name="apigen2" OR resource.labels.function_name="apigen2") AND timestamp>="2026-08-14T04:16:39.396Z" AND timestamp<="2026-08-14T04:46:39.396Z" AND httpRequest.status>=500`
- 45 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-14T04:16:39Z" AND timestamp<="2026-08-14T04:46:40Z" AND textPayload:"STARTUP TCP probe failed"`
- 22 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:00:00Z" AND textPayload:"EIO: i/o error"`
- 10 matching entries: `timestamp>="2026-08-14T04:16:39Z" AND timestamp<="2026-08-14T04:46:40Z" AND protoPayload.status.message:"Container Healthcheck failed"`
- 122 matching entries: `(resource.labels.service_name="apigen2" OR resource.labels.function_name="apigen2") AND timestamp>="2026-08-14T04:16:39.396Z" AND timestamp<="2026-08-14T04:46:39.396Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $1.62

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
