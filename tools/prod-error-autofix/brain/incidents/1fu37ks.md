fingerprint: 1fu37ks
service: handledowngradespeedupgen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-12T07:46:37.077Z
status: infra
attempt: 1

# SEO · handledowngradespeedupgen2 · 1fu37ks

**Outcome.** infra class — reported, no MR

**Root cause.** Duplicate of fingerprint sbg0vj (same event, same instance, already recorded infra): one handleDowngradeSpeedUpGen2 cold-start container (instance 001548f729a7bf83…, revision handledowngradespeedupgen2-00299-mox) never bound :8080 and was killed when Cloud Run's startup TCP probe hit its configured 240s timeout, so the single in-flight downgradeSpeedUp Pub/Sub push waiting on that cold start got 503 'instance failed the readiness check'.

**Mechanism.** The Pub/Sub push (userAgent APIs-Google, topic downgradeSpeedUp) arrived 2026-08-05T16:00:16.975890Z with no warm instance; Cloud Run logged 'Starting new instance. Reason: AUTOSCALING' 55ms later at 16:00:17.030073Z on that exact instanceId (verified by re-query). The container never reached listen(); at 16:04:17.154640Z Cloud Run emitted 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED' — 240.124s after instance start, matching the service's startupProbe {timeoutSeconds: 240, periodSeconds: 240, failureThreshold: 1} (P4). The request's own latency, 241.191594s, is that probe window plus scheduling. handleDowngradeSpeedUpGen2 is declared {memory: '1GiB', timeoutSeconds: 540, topic: 'downgradeSpeedUp', ...vpcSettings} with no minInstances (packages/functions/src/handlers/exports/pubsubFunctions.js:270), so every burst on this topic pays a full cold start; the only publisher is the finally-block dispatchWork at packages/functions/src/handlers/pubsub/subscribeOptimizeStore.js:266. Transient container-start hang, not a repo defect: 37 of 38 cold starts of the same unchanged revision that day probed successfully, and the two other starts in this same 30-min window (16:04:05.120Z, 16:04:30.981Z) both booted fine — the failing start ran >6x the slowest healthy one. P3 OOM ruled out: stderr read = 0 entries, no 'Memory limit' line on this instance; the two 1024 MiB OOM lines on this service that day are 47 and 84 minutes later on instances whose probes succeeded (separately recorded as 1yp9x9h). No message lost — a 503 nacks the push and Pub/Sub redelivers. This alert differs from sbg0vj only in which of the two log lines the sink matched (probe-failure text vs readiness-check text), so it fingerprints separately while being the same incident.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:269` — handleDowngradeSpeedUpGen2 export — the service whose cold start failed the startup probe
- `packages/functions/src/handlers/exports/pubsubFunctions.js:270` — {memory: '1GiB', timeoutSeconds: 540, topic: 'downgradeSpeedUp', ...vpcSettings} — no minInstances, so every downgradeSpeedUp message with no warm instance pays a full cold start; 1GiB with zero OOM lines at the failure timestamp rules out P3
- `packages/functions/src/handlers/pubsub/subscribeOptimizeStore.js:266` — dispatchWork('downgradeSpeedUp', …) — the only publisher to this topic, so the 503'd push originated here

## Evidence
- 1 matching entries: `resource.labels.service_name="handledowngradespeedupgen2" AND timestamp>="2026-08-05T15:52:40.838Z" AND timestamp<="2026-08-05T16:22:40.838Z" AND textPayload:"STARTUP TCP probe failed"`
- 3 matching entries: `resource.labels.service_name="handledowngradespeedupgen2" AND timestamp>="2026-08-05T15:52:40.838Z" AND timestamp<="2026-08-05T16:22:40.838Z" AND textPayload:"Starting new instance"`
- 1 matching entries: `resource.labels.service_name="handledowngradespeedupgen2" AND timestamp>="2026-08-05T00:00:00Z" AND timestamp<="2026-08-06T00:00:00Z" AND httpRequest.status>=500`
- 37 matching entries: `resource.labels.service_name="handledowngradespeedupgen2" AND timestamp>="2026-08-05T00:00:00Z" AND timestamp<="2026-08-06T00:00:00Z" AND textPayload:"STARTUP TCP probe succeeded"`
- 2 matching entries: `resource.labels.service_name="handledowngradespeedupgen2" AND timestamp>="2026-08-05T00:00:00Z" AND timestamp<="2026-08-06T00:00:00Z" AND textPayload:"Memory limit"`

## Job
- analyze rounds: 1
- cost: $1.04

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
