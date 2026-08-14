fingerprint: xtf9a9
service: handleprocessgenerateanchortextbatchgen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T08:50:52.973Z
status: infra
attempt: 1

# SEO · handleprocessgenerateanchortextbatchgen2 · xtf9a9

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the 2026-08-14T04:31:45Z prod deploy of avada-seo created revision handleprocessgenerateanchortextbatchgen2-00317-fow, whose container never bound :8080 and failed the default Cloud Run startup TCP probe with DEADLINE_EXCEEDED — one of 300+ identical startup-probe failures across ~78 unrelated avada-seo/us-central1 services in the same 04:00–05:30Z window, i.e. a platform-side container-start fault, not a defect in this repo.

**Mechanism.** handleProcessGenerateAnchorTextBatchGen2 is a gen2 Pub/Sub function declared onMessagePublished({memory:'1GiB', timeoutSeconds:540, topic:'processGenerateAnchorTextBatch', ...vpcSettings}) at packages/functions/src/handlers/exports/pubsubFunctions.js:419-422. At 2026-08-14T04:31:45.206Z a UpdateFunction operation (principalEmail tuannv@avadagroup.com, client-name cli-firebase) began rolling out revision -00317-fow; Cloud Run logged 'Starting new instance. Reason: DEPLOYMENT_ROLLOUT' at 04:31:52.676Z on that revision. The container never reached listen(): at 04:35:52.953Z the run.googleapis.com/varlog/system log emitted 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED' — 240.28s after the instance-start line, matching the default gen2 startup probe (tcpSocket :8080, timeoutSeconds 240, failureThreshold 1). 3.4s later the Ready condition flipped False for both the revision (04:35:56.379Z) and the service (04:35:56.500Z), and the UpdateFunction operation terminated ERROR code 3 at 04:35:58.543Z with 'Container Healthcheck failed. Revision ... is not ready and cannot serve traffic.' The alert is that deploy failure, not a request failure: the stderr read is 0 entries and the requests read is 0 entries, so the container died before any module in src/ logged anything, and no merchant request was served by the failed revision (Cloud Run does not shift traffic to a revision that never becomes Ready — the previous healthy revision kept serving; only 3 ERROR-severity entries exist for this service across the whole 24h, all three being the audit lines of this one failed rollout). It is not app code: two subsequent rollouts of the same function from the same pipeline came up clean on the first probe attempt — -00318-fuh 'STARTUP TCP probe succeeded after 1 attempt' at 05:17:01.649Z and -00319-led at 05:34:20.349Z, with their UpdateFunction operations completing NOTICE (no error) at 05:17:24.416Z and 05:34:26.889Z. And it is not specific to this function: the same 'STARTUP TCP probe failed' line fired 300+ times across ~78 distinct avada-seo services in 04:00–05:30Z (authgen2 56, handleproderroralertgen2 44, apigen2 40, proxygen2 20, extensiongen2 17, …, this service 1) on different revisions and different images — the same platform fault already recorded for this window under fingerprints 1s70qli, 1wpcrz3, 32rhxe, 6f0nn and others. P3 OOM is excluded: zero 'Memory limit' lines for this service in the window, and an OOM cannot occur in a process that never finished starting. Blast radius is one failed deploy of one Pub/Sub subscriber, self-healed by the 05:16Z rollout ~45 minutes later; processGenerateAnchorTextBatch messages continued to be served by the prior revision throughout.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:419` — handleProcessGenerateAnchorTextBatchGen2 export — the function whose deploy rollout failed the startup probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:420` — {memory:'1GiB', timeoutSeconds:540, topic:'processGenerateAnchorTextBatch', ...vpcSettings} — no per-function startup or health config, so the container uses Cloud Run's default 240s startup TCP probe that timed out; 1GiB with zero 'Memory limit' lines rules out P3

## Evidence
- 4 matching entries: `(resource.labels.service_name="handleprocessgenerateanchortextbatchgen2" OR resource.labels.function_name="handleProcessGenerateAnchorTextBatchGen2") AND timestamp>="2026-08-14T04:21:56.412Z" AND timestamp<="2026-08-14T04:51:56.412Z" AND severity>=ERROR`
- 300 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 2 matching entries: `resource.labels.service_name="handleprocessgenerateanchortextbatchgen2" AND timestamp>="2026-08-14T05:00:00Z" AND timestamp<="2026-08-14T06:00:00Z" AND textPayload:"STARTUP TCP probe succeeded"`
- 6 matching entries: `protoPayload.resourceName="projects/avada-seo/locations/us-central1/functions/handleProcessGenerateAnchorTextBatchGen2" AND protoPayload.methodName="google.cloud.functions.v2.FunctionService.UpdateFunction" AND timestamp>="2026-08-14T03:30:00Z" AND timestamp<="2026-08-14T06:30:00Z"`

## Job
- analyze rounds: 2
- cost: $2.47

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
