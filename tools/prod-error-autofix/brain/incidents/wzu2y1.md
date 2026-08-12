fingerprint: wzu2y1
service: updateshopswithaiusagesubscriptionexpiredtodaygen2
message: Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started.
app: SEO
repo: seo
date: 2026-08-12T07:50:04.073Z
status: infra
attempt: 2

# SEO · updateshopswithaiusagesubscriptionexpiredtodaygen2 · wzu2y1

**Outcome.** infra class — reported, no MR

**Root cause.** updateShopsWithAIUsageSubscriptionExpiredTodayGen2 runs on a 1×/hour cron with no minInstances, so every invocation is a cold start, and container module-load on 1 vCPU takes 12–233s against the Cloud Run default STARTUP TCP probe of timeoutSeconds:240 / failureThreshold:1 — 3 of 72 invocations in 72h crossed 240s, the instance was never started, and Cloud Scheduler got a 503.

**Mechanism.** cronFunctions.js:82 declares the job with {timeoutSeconds:540, memory:'1GiB', schedule:'0 * * * *', ...vpcSettings} and no minInstances, so Cloud Run holds 0 warm instances and each hourly Scheduler POST forces a fresh container. The deployed revision (updateshopswithaiusagesubscriptionexpiredtodaygen2-00300-vep) carries cpu:'1', memory:1024Mi, a VPC connector (seo-connector, private-ranges-only, from vpcSettings.js:12) and the Cloud Functions gen2 default startupProbe {tcpSocket:8080, timeoutSeconds:240, periodSeconds:240, failureThreshold:1}. Startup dominates the request wall-clock, not the handler: at 2026-08-05T21:00:02Z the request started, 'STARTUP TCP probe succeeded' logged at 21:03:28.94 (~206s of module load) and total request latency was 207.21s — i.e. subscribeUpdateShopsWithAIUsageSubscriptionExpiredToday (subscribe...ExpiredToday.js:8, one Firestore query + Promise.all of updateShopData) contributes ~1s. When module load crosses 240s the probe fails once, Cloud Run discards the instance, and the pending request is answered 503 'The request failed because the instance failed the readiness check' at a latency equal to the probe budget: 241.155s (08-04T15:00), 243.229s (08-05T17:00), 241.382s (08-05T18:00). Both alert entries carry the same instanceId 001548f7296e9f41…, so the 'probe failed' line and the 503 are one event, not two.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/cronFunctions.js:82` — Job declared with schedule '0 * * * *', memory '1GiB' and no minInstances — every hourly run is a cold start; contrast httpFunctions.js:31/46/56/112 which do set minInstances in prod
- `packages/functions/src/config/vpcSettings.js:12` — Spreads vpcConnector 'seo-connector' + PRIVATE_RANGES_ONLY in prod only, matching the run.googleapis.com/vpc-access-connector annotation on the failing revision; connector attach is part of the startup path
- `packages/functions/src/handlers/pubsub/subscribeUpdateShopsWithAIUsageSubscriptionExpiredToday.js:8` — The handler body — one getAllFreeShopsWithAIUsageSubscriptionExpiredToday query plus Promise.all of updateShopData; measured at ~1s of the request, so it is not what exceeds the probe deadline

## Evidence
- 72 matching entries: `resource.labels.service_name="updateshopswithaiusagesubscriptionexpiredtodaygen2" AND logName:"run.googleapis.com%2Frequests" AND timestamp>="2026-08-03T00:00:00Z" AND timestamp<="2026-08-06T00:00:00Z"`
- 58 matching entries: `(resource.labels.service_name="updateshopswithaiusagesubscriptionexpiredtodaygen2") AND timestamp>="2026-08-04T00:00:00Z" AND timestamp<="2026-08-06T00:00:00Z" AND (textPayload:"STARTUP" OR textPayload:"readiness" OR httpRequest.status>=500)`
- 2 matching entries: `resource.labels.service_name="updateshopswithaiusagesubscriptionexpiredtodaygen2" AND timestamp>="2026-08-05T16:50:20.128Z" AND timestamp<="2026-08-05T17:20:20.128Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.36

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
