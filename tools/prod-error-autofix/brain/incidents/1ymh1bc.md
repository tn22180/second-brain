fingerprint: 1ymh1bc
service: syncsubscribeactivecancelbfcmbundlegen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T08:02:31.241Z
status: infra
attempt: 1

# SEO · syncsubscribeactivecancelbfcmbundlegen2 · 1ymh1bc

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the deploy of revision syncsubscribeactivecancelbfcmbundlegen2-00319-yas at 2026-08-14T04:25:47Z failed Cloud Run's 240s startup TCP probe during the same platform-side container-start fault that broke 78 other avada-seo/us-central1 services in the 04:00–05:30Z window; traffic never left the healthy 00318-bom revision and the identical code passed the probe on first attempt in revisions 00320/00321/00322.

**Mechanism.** syncSubscribeActiveCancelBfcmBundleGen2 is declared onSchedule({timeoutSeconds: 540, memory: '1GiB', schedule: '0 0 */2 * *', ...vpcSettings}) at packages/functions/src/handlers/exports/cronFunctions.js:77-80. A hand-run firebase deploy (audit log methodName google.cloud.functions.v2.FunctionService.UpdateFunction, principalEmail tuannv@avadagroup.com, operation-1786681545845-658fa36dde94e) created revision -00319-yas at 04:25:47.743625Z. Cloud Run's own revision status records the boot timeline: 'Container image import completed in 1m34.11s' at 04:27:23.741534Z, then 'Provisioning imported containers completed in 13.34s. Checking container health. This will wait for up to 4m for the configured startup probe, including an initial delay of 0s' at 04:27:37.080644Z, and the instance started at 04:27:37.289511Z (Reason: DEPLOYMENT_ROLLOUT). The container never bound :8080 — at 04:31:40.416749Z Cloud Run logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED', 243.1s after the health-check start, matching the revision's own startupProbe {tcpSocket:{port:8080}, timeoutSeconds:240, periodSeconds:240, failureThreshold:1} (P4: the latency identifies which limit fired). The revision was marked HealthCheckContainerError at 04:31:46.552001Z and the service Ready condition flipped False at 04:31:47.613045Z; status.latestReadyRevisionName stayed syncsubscribeactivecancelbfcmbundlegen2-00318-bom with traffic 100%, so the failure is a rejected rollout, not a served request — requests read = 0 entries, matching. No application log exists anywhere near it (stderr read = 0 entries), so the process died before any module-scope code could log, and P3 OOM is excluded: no 'Memory limit' line on this service and the container is 1024Mi with a 1 vCPU limit that never reached listen(). The fault is not this function's: in 04:00–05:30Z the identical 'STARTUP TCP probe failed' line fired 593 times across 78 distinct avada-seo services, and 69 UpdateFunction audit entries in the same window carry 'Container Healthcheck failed' — different functions, different revisions, one region-wide window. Proof it is not the code in this worktree: with the same firebase-functions-hash source, revisions -00320-yel (05:16:22.916275Z), -00321-boc (05:33:22.818831Z) and -00322-nuj (06:52:19.210871Z) each logged 'Default STARTUP TCP probe succeeded after 1 attempt'. Blast radius is zero merchant impact: schedule is '0 0 */2 * *', so the next tick was ~19h after 00322 became healthy, and the deactivate sweep in packages/functions/src/handlers/pubsub/subscribeActiveCancelBfcmBundle.js:8 re-selects the same BFCM bundles on any later run.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/cronFunctions.js:77` — syncSubscribeActiveCancelBfcmBundleGen2 export — the function whose revision 00319 failed the startup probe
- `packages/functions/src/handlers/exports/cronFunctions.js:78` — {timeoutSeconds: 540, memory: '1GiB', schedule: '0 0 */2 * *'} — 1GiB matches the revision's 1024Mi limit (rules out a config drift) and the every-2-days schedule bounds blast radius to zero missed ticks
- `packages/functions/src/handlers/pubsub/subscribeActiveCancelBfcmBundle.js:8` — the cron body — idempotent re-selection of bundles to deactivate, so a rejected rollout loses no work

## Evidence
- 4 matching entries: `(resource.labels.service_name="syncsubscribeactivecancelbfcmbundlegen2" OR resource.labels.function_name="syncsubscribeactivecancelbfcmbundlegen2") AND timestamp>="2026-08-14T04:20:54.577Z" AND timestamp<="2026-08-14T04:50:54.577Z" AND severity>=ERROR`
- 593 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 69 matching entries: `protoPayload.methodName="google.cloud.functions.v2.FunctionService.UpdateFunction" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND severity>=ERROR AND protoPayload.status.message:"Container Healthcheck failed"`
- 24 matching entries: `resource.labels.service_name="syncsubscribeactivecancelbfcmbundlegen2" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T07:00:00Z"`

## Job
- analyze rounds: 1
- cost: $2.02

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
