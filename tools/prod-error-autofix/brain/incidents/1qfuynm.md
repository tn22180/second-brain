fingerprint: 1qfuynm
service: handleexportresourcepaginatedgen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T10:30:23.304Z
status: infra
attempt: 1

# SEO · handleexportresourcepaginatedgen2 · 1qfuynm

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the 2026-08-14T04:42:31Z prod deploy of avada-seo created revision handleexportresourcepaginatedgen2-00310-zoh, whose cold-start container never bound :8080 and was killed when Cloud Run's default startup TCP probe hit its 240s deadline — one of ~470 identical startup-probe failures across ~40 unrelated avada-seo services in the same 04:00–05:30Z deploy window, i.e. a platform-side container-start fault, not a defect in this repo.

**Mechanism.** handleExportResourcePaginatedGen2 is declared onMessagePublished({timeoutSeconds: 540, memory: '2GiB', topic: 'handleExportResourcePaginated', ...vpcSettings}) at packages/functions/src/handlers/exports/pubsubFunctions.js:366-369. At 2026-08-14T04:42:31.260998Z the deploy created revision -00310-zoh (generation 310, firebase-functions-hash 6a1603c9106996c7b9e56035239dcab1ab44f4f1, shared gen2 image us-central1-docker.pkg.dev/avada-seo/gcf-artifacts/avada--seo__us--central1__api_gen2:version_1). At 04:42:40.554392Z Cloud Run logged 'Starting new instance. Reason: DEPLOYMENT_ROLLOUT'. The container never reached listen(): at 04:46:41.386430Z it logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED' — 240.83s after the instance-start line, matching the revision's own startupProbe {tcpSocket:{port:8080}, timeoutSeconds:240, periodSeconds:240, failureThreshold:1} recorded verbatim in the audit log (P4: the latency identifies which limit fired). Two derived ERROR audit entries followed at 04:46:42.712687Z / 04:46:42.838962Z ('HealthCheckContainerError', Ready→False) plus the UpdateFunction failure at 04:46:46.456053833Z; that is the whole 4-entry errors read. P3 OOM is ruled out: zero 'Memory limit' lines on this service, and 2GiB was never touched because module load never completed. There is no application log at all (stderr read = 0 entries), consistent with a process killed before any handler ran. Not a code defect: the same commit's retry deploy created revision -00311-caf, which logged 'Default STARTUP TCP probe succeeded after 1 attempt' 17.3s after its instance start at 05:23:12.396461Z — unchanged source, same image, healthy. Blast radius is zero for merchants: the failed revision never took traffic (status.latestReadyRevisionName stayed handleexportresourcepaginatedgen2-00309-gib, traffic 100% on -00309-gib), so Pub/Sub messages on topic handleExportResourcePaginated kept being served by the previous revision; the only casualty was the deploy of this one function, which succeeded ~37 minutes later. The fault is fleet-wide, not service-specific: in 04:00–05:30Z the same 'STARTUP TCP probe failed' line fired across ~40 distinct avada-seo services (authgen2 103, handleproderroralertgen2 79, apigen2 52, onupdateshopgen2 45, proxygen2 37, extensiongen2 31 …), on different revisions, matching the already-recorded infra fingerprints for this deploy window (dw8unc, 1udmr73, 17pqsl7, s01pkg and others).

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:366` — handleExportResourcePaginatedGen2 export — the service whose cold start failed the startup probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:367` — {timeoutSeconds: 540, memory: '2GiB', topic: 'handleExportResourcePaginated'} — 2GiB with zero 'Memory limit' lines rules out P3 OOM; the failure is before listen(), not in the handler
- `packages/functions/src/handlers/pubsub/subscribeExportResourcePaginated.js:375` — the self-chaining dispatchWork('handleExportResourcePaginated', …) — chain kept running on revision -00309-gib because the failed revision never took traffic, bounding blast radius to the deploy itself

## Evidence
- 12 matching entries: `(resource.labels.service_name="handleexportresourcepaginatedgen2") AND timestamp>="2026-08-14T04:31:00Z" AND timestamp<="2026-08-14T05:30:00Z"`
- 6 matching entries: `(resource.labels.service_name="handleexportresourcepaginatedgen2") AND timestamp>="2026-08-14T05:20:00Z" AND timestamp<="2026-08-14T05:30:00Z"`
- 500 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 4 matching entries: `(resource.labels.service_name="handleexportresourcepaginatedgen2" OR resource.labels.function_name="handleexportresourcepaginatedgen2") AND timestamp>="2026-08-14T04:31:42.180Z" AND timestamp<="2026-08-14T05:01:42.180Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.45

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
