fingerprint: 13wx2gk
service: handleimportdatagen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T09:48:55.716Z
status: infra
attempt: 1

# SEO · handleimportdatagen2 · 13wx2gk

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the 2026-08-14T04:25–04:36Z prod deploy of avada-seo created revision handleimportdatagen2-00317-zes, whose container never bound :8080 and was killed by Cloud Run's 240s default startup TCP probe — one of 593 identical probe failures across 78 distinct avada-seo/us-central1 services in the same 90 minutes, i.e. a platform-side container-start fault, not a defect in this repo.

**Mechanism.** handleImportDataGen2 is declared onMessagePublished({memory: '1GiB', timeoutSeconds: 540, topic: 'handleImportData', ...vpcSettings}) at packages/functions/src/handlers/exports/pubsubFunctions.js:371-374, with no startup-probe or minInstances override, so it inherits Cloud Run's Default startup probe. The revision's own spec in the system_event payload confirms it: startupProbe {tcpSocket:{port:8080}, failureThreshold:1, periodSeconds:240, timeoutSeconds:240}, containerConcurrency 80, resources.limits {cpu:'1', memory:'1024Mi'}, runtimeClassName 'run.googleapis.com/linux-base-image-update'. Timeline: revision handleimportdatagen2-00317-zes was created at 04:31:41.107130Z (metadata.creationTimestamp); at 04:35:48.104245Z Cloud Run logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED' — 247.0s after creation, matching the probe's own 240s timeout to within scheduling granularity (P4: the latency identifies which limit fired). 5s later the Cloud Run control plane emitted HealthCheckContainerError on Ready/ConfigurationsReady/RoutesReady at 04:35:53.3–53.5Z, and the Cloud Functions v2 UpdateFunction audit entry failed at 04:35:55.349Z with code 3, 'Could not create or update Cloud Run service handleimportdatagen2, Container Healthcheck failed'. That is all 4 entries the errors read returned — there is no application log line at all (stderr read = 0), consistent with a process killed before module load finished. P3 OOM is ruled out: zero 'Memory limit' lines on this service in 04:00–06:00Z. P7 does not apply either — the alert message is a platform log, not this repo's bare-console logger. Not service-specific: in 04:00–05:30Z the same 'STARTUP TCP probe failed' line fired 593 times across 78 distinct avada-seo services (authgen2 79, handleproderroralertgen2 61, apigen2 47, proxygen2 27, extensiongen2 27, …), on unrelated revisions and unrelated code. The same service recovered without any code change: handleimportdatagen2-00318-gab probe succeeded at 05:17:00.126992Z and -00319-jof at 05:33:57.632921Z. Blast radius is zero merchant impact — status.latestReadyRevisionName stayed handleimportdatagen2-00316-her with 100% traffic, so the running revision kept consuming the handleImportData Pub/Sub topic (published from packages/functions/src/handlers/pubsub/subcribeImportData.js:53 and packages/functions/src/repositories/productRepository.js:267 via dispatchWork); only the 00317 rollout was lost, and no request-log evidence exists or can exist for this service because it is a Pub/Sub-triggered function with no HTTP callers — which is why the round-1 httpRequest.status>=500 query matched nothing.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:371` — handleImportDataGen2 export — the service whose 00317-zes revision failed the startup probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:372` — {memory: '1GiB', timeoutSeconds: 540, topic: 'handleImportData'} — no startup-probe/minInstances override, so the Default 240s TCP probe applies; 1GiB with zero 'Memory limit' lines rules out P3
- `packages/functions/src/handlers/pubsub/subcribeImportData.js:53` — dispatchWork('handleImportData', ...) — the only producer path into this topic; work kept flowing on revision 00316-her, bounding blast radius to the lost rollout
- `packages/functions/src/helpers/worker/dispatchWork.js:67` — handleImportData is a MIGRATED_TOPICS entry, so eligible shops route to the worker fleet and never touched this GCF revision at all

## Evidence
- 4 matching entries: `(resource.labels.service_name="handleimportdatagen2" OR resource.labels.function_name="handleImportDataGen2") AND timestamp>="2026-08-14T04:23:37.448Z" AND timestamp<="2026-08-14T04:53:37.448Z" AND severity>=ERROR`
- 3 matching entries: `resource.type="cloud_run_revision" AND resource.labels.service_name="handleimportdatagen2" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T06:00:00Z" AND (textPayload:"STARTUP TCP probe" OR textPayload:"Memory limit" OR textPayload:"failed to start")`
- 593 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND textPayload:"STARTUP TCP probe failed"`

## Job
- analyze rounds: 2
- cost: $2.54

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
