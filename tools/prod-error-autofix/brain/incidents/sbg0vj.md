fingerprint: sbg0vj
service: handledowngradespeedupgen2
message: The request failed because the instance failed the readiness check.
app: SEO
repo: seo
date: 2026-08-12T07:43:37.257Z
status: infra
attempt: 1

# SEO · handledowngradespeedupgen2 · sbg0vj

**Outcome.** infra class — reported, no MR

**Root cause.** One handledowngradespeedupgen2 cold-start container (instance 001548f729a7bf83…) never bound :8080 and was killed when Cloud Run's startup TCP probe hit its 240s timeout, so the single in-flight downgradeSpeedUp Pub/Sub push waiting on that cold start was answered 503 'instance failed the readiness check'.

**Mechanism.** The Pub/Sub push arrived at 2026-08-05T16:00:16.975Z with no warm instance available; Cloud Run logged 'Starting new instance. Reason: AUTOSCALING' 55ms later at 16:00:17.030Z on that exact instanceId. The container never reached listen(), and at 16:04:17.154Z Cloud Run logged 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED' — 240.124s after instance start, matching the service's `startupProbe: {timeoutSeconds: 240, periodSeconds: 240, failureThreshold: 1}` (gcloud run services describe) to the millisecond (P4). The request's own latency, 241.191594s, is that probe window plus scheduling. handleDowngradeSpeedUpGen2 is declared `{memory: '1GiB', timeoutSeconds: 540, topic: 'downgradeSpeedUp', ...vpcSettings}` with no `minInstances` (packages/functions/src/handlers/exports/pubsubFunctions.js:270), so every burst on this topic pays a full cold start; its only publisher is the finally-block dispatchWork at packages/functions/src/handlers/pubsub/subscribeOptimizeStore.js:266. This is a transient container-start hang, not a defect in this repo: 37 of 38 cold starts of the same revision (handledowngradespeedupgen2-00299-mox, unchanged image) in the same 24h probed successfully, and the timed pairs bracket at 15.0–37.8s (16:04:05.120→16:04:32.081 = 26.9s; 16:04:30.981→16:04:51.769 = 20.8s — both on the same service minutes after the failure), so the failing start ran >6× the slowest healthy one and >10× the median. P3 OOM is ruled out for this event: the container emitted no 'Memory limit … exceeded' line and no application log at all (stderr read = 0 entries) — the two 1024 MiB OOM lines on this service that day are at 16:51:47.659Z and 17:28:52.718Z, 47 and 84 minutes later, on instances whose probes succeeded (16:52:05.034Z, 17:29:09.672Z); those are the separately-recorded 1yp9x9h runtime-OOM class, not this startup failure. The 6 concurrent 'Memory limit of 512 MiB exceeded' + CANCELLED probe failures at 16:04:59–16:07:01Z belong to a different service (handleproderroralertgen2) and share no instance or revision. No message was lost: a 503 nacks the push and Pub/Sub redelivers.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:269` — handleDowngradeSpeedUpGen2 export — the service whose cold start failed the startup probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:270` — {memory: '1GiB', timeoutSeconds: 540, topic: 'downgradeSpeedUp', ...vpcSettings} — no minInstances, so every downgradeSpeedUp message with no warm instance pays a full cold start; 1GiB with zero OOM lines at the failure timestamp rules out P3
- `packages/functions/src/handlers/exports/pubsubFunctions.js:345` — handleHookSubscriberGen2 declares minInstances: 1 — proof the lever exists in this file and is deliberately not set on handleDowngradeSpeedUpGen2
- `packages/functions/src/handlers/pubsub/subscribeOptimizeStore.js:266` — dispatchWork('downgradeSpeedUp', …) in handleProgressAsset's finally block — the only publisher to this topic, so the 503'd push originated here

## Evidence
- 1 matching entries: `resource.labels.service_name="handledowngradespeedupgen2" AND timestamp>="2026-08-05T15:52:40.835Z" AND timestamp<="2026-08-05T16:22:40.835Z" AND textPayload:"STARTUP TCP probe failed"`
- 1 matching entries: `resource.labels.service_name="handledowngradespeedupgen2" AND timestamp>="2026-08-05T00:00:00Z" AND timestamp<="2026-08-06T00:00:00Z" AND httpRequest.status>=500`
- 37 matching entries: `resource.labels.service_name="handledowngradespeedupgen2" AND timestamp>="2026-08-05T00:00:00Z" AND timestamp<="2026-08-06T00:00:00Z" AND textPayload:"STARTUP TCP probe succeeded"`
- 3 matching entries: `resource.labels.service_name="handledowngradespeedupgen2" AND timestamp>="2026-08-05T15:52:40.835Z" AND timestamp<="2026-08-05T16:22:40.835Z" AND textPayload:"Starting new instance"`
- 2 matching entries: `resource.labels.service_name="handledowngradespeedupgen2" AND timestamp>="2026-08-05T00:00:00Z" AND timestamp<="2026-08-06T00:00:00Z" AND textPayload:"Memory limit"`
- 7 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-05T15:45:00Z" AND timestamp<="2026-08-05T16:30:00Z" AND textPayload:"STARTUP TCP probe failed"`

## Job
- analyze rounds: 1
- cost: $1.43

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
