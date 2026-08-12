fingerprint: 66acoy
service: updatespeedupexpiretimesubscribergen2
message: The request was aborted because there was no available instance. Additional troubleshooting documentation can be found at: <https://cloud.google.com/run/docs/troubleshooting#abort-request>
app: SEO
repo: seo
date: 2026-08-12T05:39:04.139Z
status: infra
attempt: 1

# SEO · updatespeedupexpiretimesubscribergen2 · 66acoy

**Outcome.** infra class — reported, no MR

**Root cause.** The every-2-days updateSpeedUpExpireTimePublisherGen2 cron published all 166 chunk messages (8258 shops / 50) in one burst at 00:01:39Z against updatespeedupexpiretimesubscribergen2, a service declared concurrency:1 with no minInstances that had been at zero instances for 12h+, and Cloud Run aborted 53 of the 219 push deliveries with 'no available instance' during the 30.4s it took the first container to pass its startup probe.

**Mechanism.** packages/functions/src/handlers/exports/cronFunctions.js:89 schedules updateSpeedUpExpireTime at '0 0 */2 * *'. The handler loads every page-speed-enabled installed shop (packages/functions/src/handlers/cron/updateSpeedUpExpireTime.js:12) and chunks them twice — chunk(chunk(shops,50),50) at :14 — then fires each inner chunk concurrently with `await Promise.all(shopChunk.map(chunk => dispatchWork('updateSpeedUpExpireTimePubsub', {chunk})))` at :17. 'updateSpeedUpExpireTimePubsub' is not in MIGRATED_TOPICS (packages/functions/src/helpers/worker/dispatchWork.js:45-68), so gate 1 sends every message straight to Pub/Sub (:75) — the worker fleet never absorbs any of it. 8258 shops → 166 messages, published in 4 Promise.all waves of ≤50 with nothing but a publish await between them, i.e. effectively one instant burst. Eventarc push subscription eventarc-us-central1-updatespeedupexpiretimesubscribergen2-581501-sub-529 (ackDeadline 600s, minimumBackoff 10s) delivers all 166 immediately to a service declared at packages/functions/src/handlers/exports/pubsubFunctions.js:258-267 with memory:'1GiB', timeoutSeconds:540 and **concurrency:1** (:262 — set deliberately after an earlier OOM at the default 80) and **no minInstances**. `gcloud run services describe` confirms containerConcurrency 1, maxScale 100, no minScale, startup-cpu-boost on. concurrency:1 means 166 messages need 166 instance-slots; the service served zero requests between 12:00Z and 00:01:39Z, so it started from 0. System log: 49 'Starting new instance. Reason: AUTOSCALING' from 00:01:39.150002Z, and the FIRST 'STARTUP TCP probe succeeded' only at 00:02:09.505655Z — a 30.4s capacity gap. All 53 aborts fall inside it (00:01:41.688706Z → 00:02:07.763099Z), all with latency 0s and **no instanceId**, so they never reached a container; no application log line exists for them, as expected. maxScale 100 was never approached (34 instances actually served traffic, 49 ordered), so the instance cap is not the constraint — scale-from-zero latency against a 166-message instant burst at concurrency 1 is. No work was lost: 166 of 219 deliveries returned 200 (p50 2.95s, max 195.36s — each message does Promise.all over 50 shops with live Shopify theme calls, subscribeUpdateSpeedUpExpireTime.js:19), and exactly 166 '[subscribeUpdateSpeedUpExpireTime] chunk done' lines were logged covering 8258 shops (refreshed 3541, themeGone 3031, noRecord 1686) — one per unique chunk. Deliveries (219) exceed unique messages (166) by 53, i.e. every aborted message was redelivered by the retry policy and completed. This is recurring, not new: 547 'no available instance' entries on this service between 2026-07-15 and 2026-08-12, all in minute 00:00-00:02 of cron days (worst 2026-08-03 with 274, this run 53), with several cron days clean — a marginal race against autoscaler warm-up.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:262` — concurrency: 1 — one message per instance, so a 166-message burst demands 166 instances at once
- `packages/functions/src/handlers/exports/pubsubFunctions.js:258` — updateSpeedUpExpireTimeSubscriberGen2 declared with no minInstances, so it sits at 0 instances between the 2-day cron runs
- `packages/functions/src/handlers/cron/updateSpeedUpExpireTime.js:17` — Promise.all publishes a whole wave of chunk messages simultaneously — the burst that outruns scale-from-zero
- `packages/functions/src/handlers/cron/updateSpeedUpExpireTime.js:14` — chunk(chunk(shops,50),50): 8258 shops become 166 messages in 4 back-to-back waves, no stagger between waves
- `packages/functions/src/handlers/exports/cronFunctions.js:89` — schedule '0 0 */2 * *' — the service is idle for ~48h, guaranteeing a cold start at every fan-out
- `packages/functions/src/helpers/worker/dispatchWork.js:75` — topic not in MIGRATED_TOPICS, so every message goes to GCF Pub/Sub — the worker fleet absorbs none of the burst
- `packages/functions/src/handlers/pubsub/subscribeUpdateSpeedUpExpireTime.js:19` — Promise.all over 50 shops with live Shopify theme calls per message — why a single delivery runs 3–195s and instances stay busy

## Evidence
- 219 matching entries: `resource.labels.service_name="updatespeedupexpiretimesubscribergen2" AND timestamp>="2026-08-04T23:55:00Z" AND timestamp<="2026-08-05T00:20:00Z" AND logName="projects/avada-seo/logs/run.googleapis.com%2Frequests"`
- 53 matching entries: `resource.labels.service_name="updatespeedupexpiretimesubscribergen2" AND timestamp>="2026-08-04T23:55:00Z" AND timestamp<="2026-08-05T00:20:00Z" AND textPayload:"no available instance"`
- 98 matching entries: `resource.labels.service_name="updatespeedupexpiretimesubscribergen2" AND timestamp>="2026-08-04T23:55:00Z" AND timestamp<="2026-08-05T00:20:00Z" AND logName="projects/avada-seo/logs/run.googleapis.com%2Fvarlog%2Fsystem"`
- 166 matching entries: `resource.labels.service_name="updatespeedupexpiretimesubscribergen2" AND timestamp>="2026-08-04T23:55:00Z" AND timestamp<="2026-08-05T00:30:00Z" AND textPayload:"chunk done"`
- 547 matching entries: `resource.labels.service_name="updatespeedupexpiretimesubscribergen2" AND timestamp>="2026-07-15T00:00:00Z" AND timestamp<="2026-08-12T00:00:00Z" AND textPayload:"no available instance"`

## Job
- analyze rounds: 1
- cost: $1.89

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
