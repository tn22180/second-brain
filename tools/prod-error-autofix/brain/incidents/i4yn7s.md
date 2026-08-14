fingerprint: i4yn7s
service: handledeleteallredirectsgen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T10:28:51.662Z
status: infra
attempt: 1

# SEO · handledeleteallredirectsgen2 · i4yn7s

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the 2026-08-14T04:42:30Z prod deploy of avada-seo created revision handledeleteallredirectsgen2-00310-mos, whose container never bound :8080 and was killed when Cloud Run's default 240s startup TCP probe hit DEADLINE_EXCEEDED — one of 593 identical startup-probe failures across ~40 unrelated avada-seo services in the same 90 minutes, i.e. a platform-side container-start fault, not a defect in this repo.

**Mechanism.** handleDeleteAllRedirectsGen2 is an onMessagePublished Pub/Sub function declared {timeoutSeconds:540, memory:'2GiB', topic:'handleDeleteAllRedirects', ...vpcSettings} (packages/functions/src/handlers/exports/pubsubFunctions.js:202-204), so every deploy rolls a new Cloud Run revision that must bind PORT=8080 within the default startup probe window. At 2026-08-14T04:42:30.306Z a firebase-CLI UpdateFunction call (principal tuannv@avadagroup.com, client-name 'cli-firebase') started generation 310. Cloud Run logged 'Starting new instance. Reason: DEPLOYMENT_ROLLOUT' on that revision at 04:42:39.631080Z. The container never reached listen(): at 04:46:39.966078Z it logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED' — 240.335s after the instance-start line, matching the Default startup probe's 240s deadline (revision label run.googleapis.com/startupProbeType=Default in the same audit payload) to within log granularity, i.e. P4: the latency identifies which limit fired. 1.2s later Cloud Run flipped Ready=False for revision -00310-mos (04:46:41.134512Z) then for the service (04:46:41.293554Z), and the audit log closed UpdateFunction with status code 3 (04:46:43.102202884Z). No application log line exists anywhere in the window — the stderr read returned 0 entries — consistent with a process killed before module load finished. P3 OOM is ruled out: zero 'Memory limit' lines on this service across 48h, and the declared memory is 2GiB. The fault is not service-specific and not code-specific: in 04:00–05:30Z the same 'STARTUP TCP probe failed' line fired 593 times across ~40 distinct avada-seo services on different revisions and different images (authgen2 37, apigen2 27, handleproderroralertgen2 24, proxygen2 12, extensiongen2 12, …), the same platform window already recorded as infra under fingerprints 5dup6h / 1lwydlk / 1e908f9 and others. Same-service base rate confirms it is transient: over 2026-08-13/14 this service logged 6 'STARTUP TCP probe succeeded' against this 1 failure. Blast radius is nil — the deploy self-healed on retry (UpdateFunction re-ran at 05:22:50Z and 05:39:13Z, each followed by 'STARTUP TCP probe succeeded' at 05:23:18.125602Z and 05:39:55.521380Z, no error status), and no request was lost: the requests read returned 0 entries with httpRequest.status>=500, since a revision that never goes Ready takes no traffic and the Pub/Sub topic retains undelivered messages for the still-serving previous revision.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:202` — handleDeleteAllRedirectsGen2 export — the service whose revision 00310 failed the startup probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:203` — {timeoutSeconds:540, memory:'2GiB', topic:'handleDeleteAllRedirects', ...vpcSettings} — 2GiB with zero 'Memory limit' lines in 48h rules out P3; no config here controls the startup probe, which is Cloud Run's Default
- `packages/functions/src/handlers/pubsub/subscribeHandleDeleteAllRedirects.js:75` — the handler self-chains via dispatchWork on the same topic, so an undelivered message resumes the delete sweep on the next healthy revision — bounds blast radius to a delivery delay
- `packages/functions/src/controllers/redirectController.js:739` — the only producer for this topic is a merchant-initiated dispatchWork('handleDeleteAllRedirects'), so no cron tick was lost during the failed rollout

## Evidence
- 6 matching entries: `resource.type="cloud_run_revision" AND resource.labels.service_name="handledeleteallredirectsgen2" AND timestamp>="2026-08-14T04:31:41Z" AND timestamp<="2026-08-14T05:01:41Z"`
- 593 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 7 matching entries: `(resource.labels.service_name="handledeleteallredirectsgen2" OR resource.labels.function_name="handleDeleteAllRedirectsGen2") AND timestamp>="2026-08-13T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z" AND (textPayload:"Memory limit" OR textPayload:"STARTUP TCP probe")`
- 6 matching entries: `protoPayload.methodName="google.cloud.functions.v2.FunctionService.UpdateFunction" AND resource.labels.function_name="handleDeleteAllRedirectsGen2" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T06:00:00Z"`

## Job
- analyze rounds: 2
- cost: $2.40

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
