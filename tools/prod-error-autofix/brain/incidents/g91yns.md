fingerprint: g91yns
service: retriggeroptimizepublishergen2
message: The request failed because the instance failed the readiness check.
app: SEO
repo: seo
date: 2026-08-12T08:36:35.332Z
status: infra
attempt: 1

# SEO · retriggeroptimizepublishergen2 · g91yns

**Outcome.** infra class — reported, no MR

**Root cause.** One cold-start container of retriggeroptimizepublishergen2 (instance 001548f72986fb78…) never bound :8080 and was killed when Cloud Run's startup TCP probe hit its 240s deadline, so the single Cloud Scheduler POST waiting on that cold start was answered 503 'instance failed the readiness check'.

**Mechanism.** reTriggerOptimizePublisherGen2 is declared onSchedule({memory: '1GiB', timeoutSeconds: 540, schedule: '*/30 * * * *', ...vpcSettings}) with no minInstances (packages/functions/src/handlers/exports/cronFunctions.js:67-70), so each 30-minute Cloud Scheduler tick arrives with zero warm instances and pays a full cold start — 48 cold starts in the 24h of 2026-08-06, exactly one per tick. At 2026-08-06T16:00:25.219920Z the Google-Cloud-Scheduler POST hit the service; 51ms later at 16:00:25.270972Z Cloud Run logged 'Starting new instance. Reason: AUTOSCALING' on that exact instanceId. The container never reached listen(), and at 16:04:25.399762Z Cloud Run logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED' — 240.129s after instance start, matching the service's startupProbe {tcpSocket: {port: 8080}, timeoutSeconds: 240, periodSeconds: 240, failureThreshold: 1} (gcloud run services describe) to the millisecond (P4). The request's own latency, 241.150089s, is that probe window plus scheduling. This is a transient container-start hang, not a defect in this repo: 48 of 49 cold starts of the same revision (retriggeroptimizepublishergen2-00302-bax, unchanged image) that day probed successfully, and the two timed pairs bracketing the failure are 13.9s (16:30:31.023→16:30:44.962) and 37.4s (17:00:31.402→17:01:08.831) on the same service minutes later — so the failing start ran >6× the slowest healthy one and >17× the nearest one. P3 OOM is ruled out: zero 'Memory limit' lines on this service in the whole 24h, and the container emitted no application log at all (stderr read = 0 entries), consistent with a process that never got past module load. The 4 concurrent probe failures at 16:04:42–16:06:19Z belong to a different service (handleproderroralertgen2, the separately-recorded 512MiB class) and share no instance or revision. Blast radius is one lost cron tick: onSchedule gives Cloud Scheduler no retry, so the 16:00 retrigger sweep never ran; the next tick at 16:30 started cleanly and reTriggerOptimize re-selects the same stalled shops via getShopToReTriggerOptimize (packages/functions/src/handlers/cron/reTriggerOptimize.js:13), so the only effect is a 30-minute delay in rescuing timed-out optimize jobs.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/cronFunctions.js:67` — reTriggerOptimizePublisherGen2 export — the service whose cold start failed the startup probe
- `packages/functions/src/handlers/exports/cronFunctions.js:68` — {memory: '1GiB', timeoutSeconds: 540, schedule: '*/30 * * * *'} — no minInstances, so every one of the 48 daily scheduler ticks pays a full cold start; 1GiB with zero 'Memory limit' lines that day rules out P3
- `packages/functions/src/handlers/exports/pubsubFunctions.js:345` — handleHookSubscriberGen2 declares minInstances: 1 — proof the lever exists in this repo and is deliberately not set on the cron exports
- `packages/functions/src/handlers/cron/reTriggerOptimize.js:13` — getShopToReTriggerOptimize() re-selects stalled shops on every run, so the lost 16:00 tick self-heals at 16:30 — bounds the blast radius to a 30-minute delay

## Evidence
- 1 matching entries: `resource.labels.service_name="retriggeroptimizepublishergen2" AND timestamp>="2026-08-06T00:00:00Z" AND timestamp<="2026-08-07T00:00:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 48 matching entries: `resource.labels.service_name="retriggeroptimizepublishergen2" AND timestamp>="2026-08-06T00:00:00Z" AND timestamp<="2026-08-07T00:00:00Z" AND textPayload:"STARTUP TCP probe succeeded"`
- 1 matching entries: `resource.labels.service_name="retriggeroptimizepublishergen2" AND timestamp>="2026-08-06T00:00:00Z" AND timestamp<="2026-08-07T00:00:00Z" AND httpRequest.status>=500`
- 6 matching entries: `resource.labels.service_name="retriggeroptimizepublishergen2" AND timestamp>="2026-08-06T15:55:00Z" AND timestamp<="2026-08-06T17:10:00Z" AND (textPayload:"Starting new instance" OR textPayload:"STARTUP TCP probe")`
- 5 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-06T15:45:00Z" AND timestamp<="2026-08-06T16:30:00Z" AND textPayload:"STARTUP TCP probe failed"`

## Job
- analyze rounds: 1
- cost: $1.27

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
