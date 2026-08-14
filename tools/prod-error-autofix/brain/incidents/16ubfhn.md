fingerprint: 16ubfhn
service: apigen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T06:22:53.984Z
status: infra
attempt: 1

# SEO · apigen2 · 16ubfhn

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: a platform-side container-start/filesystem fault in avada-seo/us-central1 during the 04:00–05:00Z hour on 2026-08-14 stopped apigen2 replacement containers from booting — 42 distinct cold-start instances of the unchanged revision apigen2-00324-zab failed the 8080 startup TCP probe with DEADLINE_EXCEEDED (one of them dying earlier with `Error: EIO: i/o error, read` from fs.readFileSync during module load) — so the 165 apigen2 5xx in the window are collateral, not an application defect.

**Mechanism.** apiGen2 is declared onRequest({timeoutSeconds:540, memory:'2GiB', maxInstances:200, concurrency:3, minInstances: isProduction ? 3 : 0}) at packages/functions/src/handlers/exports/httpFunctions.js:40-49, i.e. concurrency 3 per instance, so the embedded admin's request rate needs Cloud Run to keep spawning instances beyond the 3 warm ones. Between 04:14:36Z and 04:40:29Z every one of those spawns failed: the errors read holds 42 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080 … Connection failed with status DEADLINE_EXCEEDED' lines, spread over 42 distinct instanceIds, all on a single revision apigen2-00324-zab (200/200 error entries carry that revision). The requests read shows what that did to traffic: 165 5xx — 146×500 'The request failed because the instance could not start successfully.' (114) / 'instance failed the readiness check' (12/19), and 31×503 'The request was aborted because there was no available instance.' — smeared across 20+ unrelated endpoints (POST /api/track-event 25, GET /api/analysis-count 17, /api/subscription 17, /api/settings 14, /api/tasks-completed 13, /api/shop/appStatus 10 …). No single handler is implicated; the failures are per-instance, not per-route. One instance (001548f729bc, 04:26:11.500Z) got far enough to log why the boot died: 'Provided module can't be loaded. … Detailed stack trace: Error: EIO: i/o error, read at Object.readFileSync (node:fs:440:20) … at Object.<anonymous> (/workspace/lib/helpers/seoSpeed.js:25:18) … at Object.<anonymous> (/workspace/lib/services/lightHouseService.js:18:17)' followed by 'Could not load the function, shutting down.' — an EIO on reading a bundle file off the container filesystem, inside the ordinary lightHouseService → seoSpeed require chain (src: packages/functions/src/services/lightHouseService.js:9). EIO from readFileSync is the gVisor/overlay layer failing to serve a byte range, not a syntax or import defect: the same code booted fine on the same revision before and after, and the last master commit is 72919c08f0 dated 2026-08-12T09:49:52+07:00, two days before the incident, so nothing shipped. The fault is fleet-wide, which settles it: in 04:00–05:00Z avada-seo logged 593 'STARTUP TCP probe failed' lines across 78 distinct Cloud Run services (authgen2 131, handleproderroralertgen2 88, onupdateshopgen2 77, apigen2 52, proxygen2 44 …) and 22 'EIO: i/o error' module-load deaths across 9 services on different revisions and different images. P3 OOM is ruled out — zero 'Memory limit' lines on apigen2 in the window, and an OOM would not produce a startup-probe DEADLINE_EXCEEDED on 42 separate never-started containers. Same hour is already recorded as infra under fingerprints 1mprni / 8g3u6t / 1470mjt / 1bwfmw9 / e9i6k0 / pva4gd / 1r74ll6.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:40` — apiGen2 export — the service whose 42 cold-start containers failed the 8080 startup probe
- `packages/functions/src/handlers/exports/httpFunctions.js:47` — minInstances: isProduction ? 3 : 0 with concurrency: 3 — only 3 warm instances, so all traffic above ~9 in-flight requests depends on cold starts that could not boot during the window
- `packages/functions/src/services/lightHouseService.js:9` — import {checkLCPImage} from '@functions/helpers/seoSpeed' — the require frame shown in the crashing container's stack (lib/services/lightHouseService.js:18 → lib/helpers/seoSpeed.js:25); the failure is an fs read EIO on this ordinary import chain, not a defect in it
- `packages/functions/src/helpers/seoSpeed.js:1` — the module whose file read returned EIO during boot — unchanged since before the window, proving the fault is the container filesystem, not this file

## Evidence
- 42 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-14T04:10:41.217Z" AND timestamp<="2026-08-14T04:40:41.217Z" AND severity>=ERROR AND textPayload:"STARTUP TCP probe failed"`
- 165 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-14T04:10:41.217Z" AND timestamp<="2026-08-14T04:40:41.217Z" AND httpRequest.status>=500`
- 593 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:00:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 22 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:00:00Z" AND textPayload:"EIO: i/o error"`

## Job
- analyze rounds: 1
- cost: $1.46

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
