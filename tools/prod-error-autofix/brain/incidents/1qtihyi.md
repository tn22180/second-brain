fingerprint: 1qtihyi
service: syncsubscribeactivechargegen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-14T10:25:22.544Z
status: infra
attempt: 1

# SEO · syncsubscribeactivechargegen2 · 1qtihyi

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: the 2026-08-14T04:42:31Z prod deploy of avada-seo created revision syncsubscribeactivechargegen2-00141-xec, whose container never bound :8080 and was killed when Cloud Run's default 240s startup TCP probe expired — one of 120 identical container-start failures across 60 distinct avada-seo/us-central1 services in the same 90 minutes, i.e. a platform-side fault in that deploy window, not a defect in this repo.

**Mechanism.** syncSubscribeActiveChargeGen2 is declared onSchedule({timeoutSeconds: 540, memory: '2GiB', schedule: '0 0 * * *', ...vpcSettings}) at packages/functions/src/handlers/exports/cronFunctions.js:72-75, so its container is the standard shared api_gen2 image (image us-central1-docker.pkg.dev/avada-seo/gcf-artifacts/avada--seo__us--central1__api_gen2:version_1, build-function-target {"worker":"apiGen2"}). At 2026-08-14T04:42:31.097158Z the firebase CLI deploy (principalEmail tuannv@avadagroup.com, methodName google.cloud.functions.v2.FunctionService.UpdateFunction) created revision -00141-xec, generation 141. Cloud Run logged 'Starting new instance. Reason: DEPLOYMENT_ROLLOUT' at 04:42:39.689834Z; the process never reached listen() and at 04:46:40.260458Z Cloud Run logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED' — 240.57s after the instance-start line, matching the revision's own startupProbe {tcpSocket:{port:8080}, failureThreshold:1, periodSeconds:240, timeoutSeconds:240} recorded verbatim in the audit payload (P4: the latency identifies which limit fired). Two further ERROR entries at 04:46:42.865701Z / 04:46:43.019313Z are the resulting HealthCheckContainerError on the Service and the UpdateFunction failure (status code 3 / code 9). Zero application log lines exist for this revision (stderr read = 0 entries), consistent with a process killed before module load finished; P3 OOM is ruled out — no 'Memory limit' line on this service in the full 24h, and the container is 2GiB with cpu:1. The fault is not service-specific: in 04:00–05:30Z the same 'failed to start and listen on the port' message fired 120 times across 60 distinct avada-seo services, on different revisions, with unchanged code — the same window already recorded as infra under fingerprints 1ymh1bc, s01pkg, 17pqsl7, a62zk and ~50 others. Blast radius is zero merchant impact: traffic stayed on the last ready revision -00140-mid (status.latestReadyRevisionName = syncsubscribeactivechargegen2-00140-mid, traffic 100% to it), the daily 00:00 cron had already completed successfully that day ('[subscribeActiveCharge] done: 10257 fetched, 8970 unique shops, 180 batches published' at 00:01:25.711617Z), and the deploy self-healed on retry — revisions -00142-vaq (05:23:19Z), -00143-sil (05:39:55Z) and -00144-mil (06:59:06Z) each logged 'Default STARTUP TCP probe succeeded after 1 attempt'.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/cronFunctions.js:72` — syncSubscribeActiveChargeGen2 export — the service whose deploy-rollout container failed the startup probe
- `packages/functions/src/handlers/exports/cronFunctions.js:73` — {timeoutSeconds: 540, memory: '2GiB', schedule: '0 0 * * *', ...vpcSettings} — 2GiB with zero 'Memory limit' lines that day rules out P3; the daily-only schedule bounds blast radius, the 00:00 run had already succeeded

## Evidence
- 4 matching entries: `(resource.labels.service_name="syncsubscribeactivechargegen2" OR resource.labels.function_name="syncsubscribeactivechargegen2") AND timestamp>="2026-08-14T04:31:41.039Z" AND timestamp<="2026-08-14T05:01:41.039Z" AND severity>=ERROR`
- 27 matching entries: `resource.labels.service_name="syncsubscribeactivechargegen2" AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z"`
- 120 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T04:00:00Z" AND timestamp<="2026-08-14T05:30:00Z" AND protoPayload.status.message:"failed to start and listen on the port"`
- 1 matching entries: `resource.labels.service_name="syncsubscribeactivechargegen2" AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-15T00:00:00Z" AND textPayload:"subscribeActiveCharge"`

## Job
- analyze rounds: 1
- cost: $1.45

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
