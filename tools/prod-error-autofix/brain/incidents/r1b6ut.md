fingerprint: r1b6ut
service: handlegetbulkresourcegen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T08:52:43.207Z
status: infra
attempt: 1

# SEO · handlegetbulkresourcegen2 · r1b6ut

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the 2026-08-14T04:31:38Z prod deploy of avada-seo created revision handlegetbulkresourcegen2-00317-cah, whose container never bound :8080 within the 240s default startup TCP probe and was rejected with HealthCheckContainerError — one of 593 identical 'Default STARTUP TCP probe failed' events across 40+ unrelated avada-seo/us-central1 services in the 04:00–05:30Z window, i.e. a platform-side container-start fault during that deploy, not a defect in this repo.

**Mechanism.** handleGetBulkResourceGen2 is a Pub/Sub gen2 function declared onMessagePublished({timeoutSeconds: 540, memory: '1GiB', topic: 'handleGetBulkResource', ...vpcSettings}) at packages/functions/src/handlers/exports/pubsubFunctions.js:361-364. The 04:25–04:47Z prod deploy pushed generation 317; Cloud Run created revision handlegetbulkresourcegen2-00317-cah at 04:31:38.039886Z (metadata.creationTimestamp in the ReplaceInternalService audit entry). Its podspec carries the Firebase default startupProbe {tcpSocket:{port:8080}, timeoutSeconds:240, periodSeconds:240, failureThreshold:1} (logs.json errors[1] spec.template.spec.containers[0].startupProbe). At 04:35:47.845472Z the revision logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED' — 249.8s after instance creation, matching the 240s probe deadline (P4: latency identifies which limit fired). 4.1s later Cloud Run flipped Ready=False with reason HealthCheckContainerError (04:35:52.099982Z) and the Cloud Functions v2 UpdateFunction call failed with code 3 (04:35:54.081937917Z). Not a code defect: the same image and same firebase-functions-hash 6a1603c9106996c7b9e56035239dcab1ab44f4f1 started cleanly on the same day — 'STARTUP TCP probe succeeded after 1 attempt' at 05:16:58Z, 05:33:50Z and 06:53:04Z — and across the full 24h this service logged exactly one probe failure, zero 'Memory limit' lines (P3 OOM ruled out) and zero httpRequest 5xx. The container died before module load, so the stderr read is empty by construction, which is also the expected state for this app's bare-console logger (P7). Blast radius is nil for merchants: status.latestReadyRevisionName stayed handlegetbulkresourcegen2-00316-cel with traffic 100% on it, so handleGetBulkResource Pub/Sub messages kept being served by the previous revision; only the deploy of this one function failed and needed a redeploy.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:361` — handleGetBulkResourceGen2 export — the function whose revision 00317-cah failed its startup probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:362` — {timeoutSeconds: 540, memory: '1GiB', topic: 'handleGetBulkResource', ...vpcSettings} — 1GiB matches the deployed 1024Mi limit; no memory/startup override in repo, so the 240s default startupProbe that fired is Firebase's, not a repo setting
- `packages/functions/src/handlers/exports/pubsubFunctions.js:363` — wrapPubSub(subscribeHandleGetBulkResource) — handler body never ran; the container was killed before module load, hence zero application log lines

## Evidence
- 4 matching entries: `(resource.labels.service_name="handlegetbulkresourcegen2" OR resource.labels.function_name="handlegetbulkresourcegen2") AND timestamp>="2026-08-14T04:21:58.622Z" AND timestamp<="2026-08-14T04:51:58.622Z" AND severity>=ERROR`
- 593 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND textPayload:"Default STARTUP TCP probe failed"`
- 4 matching entries: `(resource.labels.service_name="handlegetbulkresourcegen2" OR resource.labels.function_name="handlegetbulkresourcegen2") AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z" AND (textPayload:"STARTUP TCP probe" OR httpRequest.status>=500 OR textPayload:"Memory limit")`

## Job
- analyze rounds: 1
- cost: $1.53

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
