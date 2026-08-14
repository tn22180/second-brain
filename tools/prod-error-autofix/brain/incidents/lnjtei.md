fingerprint: lnjtei
service: resetoptimizeschedulegen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T10:49:10.721Z
status: infra
attempt: 1

# SEO · resetoptimizeschedulegen2 · lnjtei

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the 2026-08-14T04:42:30Z prod deploy of avada-seo created revision resetoptimizeschedulegen2-00311-may, whose container never bound :8080 within the 240s default startup TCP probe, so Cloud Run rejected the revision (HealthCheckContainerError) — one of 60 avada-seo services hit by the same platform-side container-start fault in that deploy window; traffic stayed on the previous ready revision -00310-ril and no cron invocation failed.

**Mechanism.** resetOptimizeScheduleGen2 is declared onSchedule({timeoutSeconds: 540, memory: '2GiB', schedule: '1 1 * * *', ...vpcSettings}, resetOptimize) at packages/functions/src/handlers/exports/cronFunctions.js:19-22. At 2026-08-14T04:42:29.612Z a firebase-cli UpdateFunction by tuannv@avadagroup.com (protoPayload.authenticationInfo.principalEmail) created revision resetoptimizeschedulegen2-00311-may (metadata.creationTimestamp 04:42:30.923453Z, configurationGeneration 311, image avada--seo__us--central1__api_gen2:version_1, firebase-functions-hash 6a1603c9106996c7b9e56035239dcab1ab44f4f1). Cloud Run started the instance at 04:42:39.376994Z ('Starting new instance. Reason: DEPLOYMENT_ROLLOUT'). The container never reached listen(): at 04:46:45.307055Z Cloud Run logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED' — 245.93s after instance start, matching the revision's own startupProbe {tcpSocket:{port:8080}, timeoutSeconds:240, periodSeconds:240, failureThreshold:1} in the logged Revision spec (P4: the latency identifies which limit fired). Two seconds later the Service Ready condition flipped False with reason 'HealthCheckContainerError' (04:46:47.729424Z) and UpdateFunction returned status code 3 at 04:46:51.710724Z. This is not code: the same 'failed to start and listen on the port' message fired for 60 distinct avada-seo services (120 entries) in 04:00–05:30Z on unchanged code and different images — apigen2, apiv2gen2, authsagen2, changelogtriggers-shops and 56 more — the same fault already recorded under fingerprints b3r1nk / 1huzatk / hp9jv6 / dw8unc etc. P3 OOM is ruled out: zero 'Memory limit' lines, and the container emitted no application log at all (stderr read = 0 entries), consistent with a process killed before module load finished. Blast radius is zero: status.latestReadyRevisionName stayed resetoptimizeschedulegen2-00310-ril with 100% traffic, requests read = 0 entries (no 5xx), the 01:01 daily cron tick that day started an instance at 01:01:00.960495Z and its probe succeeded at 01:01:27.495079Z, and the next deploys at 05:22:55Z, 05:39:36Z and 06:58:51Z all logged 'Default STARTUP TCP probe succeeded after 1 attempt' — the fault self-healed within the same hour.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/cronFunctions.js:19` — resetOptimizeScheduleGen2 export — the service whose deploy rollout failed the startup probe
- `packages/functions/src/handlers/exports/cronFunctions.js:20` — {timeoutSeconds: 540, memory: '2GiB', schedule: '1 1 * * *'} — 2GiB with zero 'Memory limit' lines rules out P3; the 1×/day schedule means the failed 04:42Z rollout hit no invocation
- `packages/functions/src/handlers/exports/cronFunctions.js:3` — import resetOptimize from '../cron/resetOptimize' — handler is unchanged app code, not implicated; the container died before module load emitted any log
- `packages/functions/src/handlers/cron/resetOptimize.js:1` — the cron body that never ran on revision -00311-may; the 01:01Z tick ran fine on -00310-ril

## Evidence
- 4 matching entries: `(resource.labels.service_name="resetoptimizeschedulegen2" OR resource.labels.function_name="resetOptimizeScheduleGen2") AND timestamp>="2026-08-14T04:31:54Z" AND timestamp<="2026-08-14T05:01:54Z" AND severity>=ERROR`
- 120 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND protoPayload.status.message:"failed to start and listen on the port"`
- 59 matching entries: `(resource.labels.service_name="resetoptimizeschedulegen2" OR resource.labels.function_name="resetOptimizeScheduleGen2") AND timestamp>="2026-08-13T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z"`
- 8 matching entries: `(resource.labels.service_name="resetoptimizeschedulegen2" OR resource.labels.function_name="resetOptimizeScheduleGen2") AND timestamp>="2026-08-14T04:31:54Z" AND timestamp<="2026-08-14T05:01:54Z"`

## Job
- analyze rounds: 1
- cost: $1.43

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
