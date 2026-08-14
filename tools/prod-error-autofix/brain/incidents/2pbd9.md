fingerprint: 2pbd9
service: handleapproveinternallinkbatchgen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T09:54:04.271Z
status: infra
attempt: 1

# SEO · handleapproveinternallinkbatchgen2 · 2pbd9

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the 2026-08-14T04:25:47Z prod deploy of avada-seo created revision handleapproveinternallinkbatchgen2-00318-wok, whose container never bound :8080 before the 240s default startup TCP probe deadline — one of 69 identical HealthCheckContainerError failures across ~60 distinct avada-seo functions in the same 04:00–05:30Z window, i.e. a platform-side container-start fault during that rollout, not a defect in this repo.

**Mechanism.** handleApproveInternalLinkBatchGen2 is declared onMessagePublished({memory:'1GiB', timeoutSeconds:540, topic:'approveInternalLinkBatch', ...vpcSettings}) at packages/functions/src/handlers/exports/pubsubFunctions.js:454-457. The deploy (principalEmail tuannv@avadagroup.com, methodName google.cloud.functions.v2.FunctionService.UpdateFunction, operation-id 42f140ad-fc6a-41f4-9b64-0026ce426a4c) created revision -00318-wok at creationTimestamp 2026-08-14T04:25:47.769006Z. Its spec carries startupProbe {tcpSocket:{port:8080}, timeoutSeconds:240, periodSeconds:240, failureThreshold:1}; at 04:31:48.149830Z Cloud Run flipped Ready to False with reason HealthCheckContainerError — 'The user-provided container failed to start and listen on the port defined provided by the PORT=8080 environment variable within the allocated timeout', and at 04:31:51.057872Z the Cloud Functions audit log recorded status.code 3 'Could not create or update Cloud Run service handleapproveinternallinkbatchgen2, Container Healthcheck failed'. The alert's 'Default STARTUP TCP probe failed 1 time consecutively … DEADLINE_EXCEEDED' is that same probe expiring, matching timeoutSeconds:240 (P4 — the latency identifies which limit fired). Not app code: the revision spec shows runtimeClassName 'run.googleapis.com/linux-base-image-update' and a build-image-uri/build-function-target pointing at a different function's artifact (changelog_triggers--shops:version_1 / changelogTriggers.shops), i.e. the platform's own base-image rollout machinery, and the identical failure hit ~60 unrelated services (apiGen2, authGen2, proxyGen2, sidekickGen2, onCreateUserGen2, …) on different images and unchanged code in the same 90 minutes. P3 OOM is ruled out: zero 'Memory limit' lines and zero httpRequest.status>=500 on this service for the whole 24h. P7 applies — SEO's logger is bare console.*, so the stderr read is empty by design; the container died before module load anyway, so no application log exists. Blast radius is zero merchant impact: status.traffic still routes 100% to latestReadyRevisionName handleapproveinternallinkbatchgen2-00317-gun, so approveInternalLinkBatch messages kept being served by the previous revision; only the code update for this function failed to land.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:454` — handleApproveInternalLinkBatchGen2 export — the function whose new revision failed the startup probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:455` — {memory:'1GiB', timeoutSeconds:540, topic:'approveInternalLinkBatch'} — 1GiB matches the revision spec's 1024Mi; zero 'Memory limit' lines that day rules out P3

## Evidence
- 4 matching entries: `(resource.labels.service_name="handleapproveinternallinkbatchgen2" OR resource.labels.function_name="handleApproveInternalLinkBatchGen2") AND timestamp>="2026-08-14T04:23:51Z" AND timestamp<="2026-08-14T04:53:51Z" AND severity>=ERROR`
- 69 matching entries: `timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND protoPayload.status.message:"Container Healthcheck failed"`
- 4 matching entries: `(resource.labels.service_name="handleapproveinternallinkbatchgen2" OR resource.labels.function_name="handleApproveInternalLinkBatchGen2") AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z"`

## Job
- analyze rounds: 1
- cost: $1.46

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
