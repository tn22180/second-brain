fingerprint: 1hhuvvv
service: syncsubscribeactivecharge
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: BLOG
repo: blogs
date: 2026-08-14T04:08:01.497Z
status: infra
attempt: 1

# BLOG · syncsubscribeactivecharge · 1hhuvvv

**Outcome.** infra class — reported, no MR

**Root cause.** One syncsubscribeactivecharge cold-start container (instance 001548f72995ac61…, revision -00124-jag) failed to bind :8080 within Cloud Run's 240s default startup TCP probe on 2026-08-14T04:00:30Z and was killed; it is a one-off platform-side container-startup stall, not a defect in this function's code — the same service cold-started 348 times in the preceding 7 days with a median of 10.76s and a p95 of 19.74s, and the immediately preceding run at 03:30 bound in 12.45s.

**Mechanism.** Cloud Scheduler POSTed the */30 trigger at 2026-08-14T04:00:30.447Z. Cloud Run had no warm capacity (maxInstances:1, no minInstances) so it logged 'Starting new instance. Reason: AUTOSCALING' at 04:00:30.499Z. The default gen2 startup probe is TCP :8080, timeout 240s, failureThreshold 1; the probe failed at 04:04:31.248Z, exactly 240.75s after the start line — P4, a latency matching a configured limit to the tenth of a second. The container never reached listen(), so no application log line exists (stderr read is empty, as expected). The scheduler request returned 503 'The request failed because the instance failed the readiness check.' after 245.68s. onSchedule is declared with no retryConfig, so Cloud Scheduler did not redeliver: the 04:00 run of subscribeActiveCharge never called getAllChargeActive and never published the updateSubscriberTokens chunks. Blast radius is one container only — 15 other container starts across 7 services (subscriberenewsubscribertokenshandler ×3, ontokenuserwritten ×2, auth ×2, api ×2, proxy ×5, authsa, apisa) in the surrounding 03:30–04:05Z band all bound :8080 in 9.3–36.3s, so this was not a project-wide startup band like fingerprint gtghfi. Consequence is bounded: token renewal is guarded by a 30-day per-cycle window in subscribeRenewSubscriberTokens, so the next 04:30 run re-reads every active charge and republishes — the single dropped run delays a due renewal by at most 30 minutes and loses no data.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/functions/scheduled.js:7` — syncSubscribeActiveCharge is declared onSchedule '*/30 * * * *' with maxInstances:1 and no minInstances and no retryConfig — every trigger may pay a cold start, and a failed delivery is dropped rather than retried.
- `packages/functions/src/functions/scheduled.js:11` — cpu: 0.5 with memory 512MiB is the thinnest allocation in this repo's scheduled functions; it gives the least headroom for module load when platform startup is degraded (baseline still only 10.76s median, so this did not cause the failure — it is the headroom margin).
- `packages/functions/src/index.js:9` — index.js re-exports http, pubsub, scheduled and firestore, so every syncsubscribeactivecharge container evaluates the whole functions import graph at 0.5 vCPU before it can bind :8080 — the source of the ~10.8s median cold start.
- `packages/functions/src/handlers/pubsub/subcribeActiveCharge.js:8` — The getAllChargeActive → publishTopic('updateSubscriberTokens') work the dropped 04:00 delivery never reached.
- `packages/functions/src/handlers/pubsub/subscribeRenewSubscriberTokens.js:122` — The 30-day per-cycle idempotency guard that makes a single skipped 30-minute run recoverable by the next run rather than a permanent miss.

## Evidence
- 1 matching entries: `(resource.labels.service_name="syncsubscribeactivecharge") AND timestamp>="2026-08-14T00:00:00Z" AND timestamp<="2026-08-14T05:00:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 696 matching entries: `(resource.labels.service_name="syncsubscribeactivecharge") AND timestamp>="2026-08-07T00:00:00Z" AND timestamp<="2026-08-14T05:00:00Z" AND (textPayload:"Starting new instance" OR textPayload:"STARTUP TCP probe succeeded")`
- 1 matching entries: `(resource.labels.service_name="syncsubscribeactivecharge") AND timestamp>="2026-08-07T00:00:00Z" AND timestamp<="2026-08-14T05:00:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 37 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-08-14T03:30:00Z" AND timestamp<="2026-08-14T04:40:00Z" AND (textPayload:"Starting new instance" OR textPayload:"STARTUP TCP probe")`
- 1 matching entries: `(resource.labels.service_name="syncsubscribeactivecharge") AND timestamp>="2026-08-14T03:49:33.657Z" AND timestamp<="2026-08-14T04:19:33.657Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $1.53

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
