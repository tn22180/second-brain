fingerprint: 19mrmo0
service: changelogtriggers-shops
message: The request was aborted because there was no available instance. Additional troubleshooting documentation can be found at: <https://cloud.google.com/run/docs/troubleshooting#abort-request>
app: SEO
repo: seo
date: 2026-08-02T00:15:08.485Z
status: infra
attempt: 1

# SEO · changelogtriggers-shops · 19mrmo0

**Outcome.** infra class — reported, no MR

**Root cause.** The month-boundary credit reset wrote 6915 shop docs in ~2.5 minutes (vs 4-67 on ordinary nights), and every write fans out 1:1 to the Firestore-written trigger changelogtriggers-shops, which runs with no minInstances at a 33 req/min baseline — Cloud Run aborted 776 of 6811 deliveries during the ~15s it took to boot 27 instances.

**Mechanism.** subscribeActiveCharge publishes all 179 updateSubscriberCredits batches at once (packages/functions/src/handlers/pubsub/subscribeActiveCharge.js:45, BATCH_SIZE=50 at :7) covering 8912 shops. Each message runs 50 shops at pLimit(5) (subscribeUpdateNewSubscriberCredits.js:87). The gate that normally suppresses work is `isWithinResetWindow = now - lastCreditUpdate < 30 days` (:142); resetSubscriptionCredit sets `AIUsage.lastCreditUpdate = now` for every shop it touches via updateShopData (:117), so the whole fleet's lastCreditUpdate is synchronized into one cohort and the entire cohort ages out of the 30-day window on the same night. Log counts of '[updateSubscriberCredits] ... Reset subscription credits': 9, 4, 8, 11, 7, 67 on 2026-07-27..08-01, then 6915 on 2026-08-02 — a 103x-1729x step. Each of those is a Firestore write to shops/{id}, and shops/{id} is one of the three collections registered on the BigQuery changelog trigger (packages/functions/src/config/changelog.js:8-15, which passes only `memory: '1GiB'` — no minInstances, no concurrency override). changelogtriggers-shops request volume: 32-41/min baseline 23:50-00:01, 138 at 00:02, 6811 at 00:03, 860 at 00:04, back to ~40 by 00:05. Of the 6811, 6035 returned 200 and 776 returned 500 'no available instance', all between 00:03:08.x and 00:03:25.302915Z, every one with latency 0s and no instanceId — they never reached a container. The system log shows 27 'Starting new instance. Reason: AUTOSCALING' orders from 00:03:08.245727Z and the first 'STARTUP TCP probe succeeded' only at 00:03:23.047716Z; the last abort is at 00:03:25.302915Z, i.e. the aborts stop the moment capacity lands. `gcloud run services describe` confirms revision changelogtriggers-shops-00234-qiz: containerConcurrency 80, timeoutSeconds 60, 1024Mi, maxScale 100, no minScale annotation. maxScale was never the constraint — only 16 distinct instanceIds served the burst. The control case proves it is per-request cost, not the burst alone: onupdateshopgen2 is triggered by the same shop writes with the identical config (maxScale 100, concurrency 80, 1024Mi, no minScale) and took 6035 requests in the same minute with ZERO 500s — its p50 latency is 0.0026s across 8 instances, while changelogtriggers-shops p50 is 0.214s (82x), p90 0.60s, p99 1.51s, max 76.4s. At 0.21s/request the changelog trigger needs ~82x the instance-seconds for the same event stream, so it hit the capacity wall while scaling from ~1 instance and onupdateshopgen2 did not.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/config/changelog.js:9` — changelogTriggers is registered with only memory: '1GiB' — no minInstances, so the shops trigger sits near zero instances at its 33 req/min baseline and must cold-scale into the 6811 req/min burst
- `packages/functions/src/config/changelog.js:11` — collectionId 'shops' is what binds every shop-doc write to the changelogtriggers-shops Cloud Run service, 1:1
- `packages/functions/src/handlers/pubsub/subscribeUpdateNewSubscriberCredits.js:117` — resetSubscriptionCredit's updateShopData call — the shop write that produces each trigger event; 6915 of these fired in ~2.5 min
- `packages/functions/src/handlers/pubsub/subscribeUpdateNewSubscriberCredits.js:142` — isWithinResetWindow uses a fixed 30-day delta from lastCreditUpdate, and the reset itself stamps lastCreditUpdate=now for the whole fleet — this is what synchronizes all shops into one cohort that expires on the same night
- `packages/functions/src/handlers/pubsub/subscribeUpdateNewSubscriberCredits.js:87` — pLimit(5) per message x 179 concurrent messages ≈ 900 concurrent shop writes — the write rate that outruns the trigger's autoscaler
- `packages/functions/src/handlers/pubsub/subscribeActiveCharge.js:45` — Promise.all publishes all 179 batches simultaneously with no stagger — the upstream burst
- `packages/functions/src/handlers/pubsub/subscribeActiveCharge.js:7` — BATCH_SIZE = 50 turns 8912 shops into 179 concurrent messages

## Evidence
- 776 matching entries: `resource.labels.service_name="changelogtriggers-shops" AND timestamp>="2026-08-02T00:00:00Z" AND timestamp<="2026-08-02T00:15:00Z" AND textPayload:"no available instance"`
- 6811 matching entries: `resource.labels.service_name="changelogtriggers-shops" AND timestamp>="2026-08-02T00:03:00Z" AND timestamp<="2026-08-02T00:04:00Z" AND logName="projects/avada-seo/logs/run.googleapis.com%2Frequests"`
- 7527 matching entries: `resource.labels.service_name="changelogtriggers-shops" AND timestamp>="2026-08-01T23:50:00Z" AND timestamp<="2026-08-02T00:20:00Z" AND logName="projects/avada-seo/logs/run.googleapis.com%2Frequests"`
- 6915 matching entries: `timestamp>="2026-08-02T00:02:00Z" AND timestamp<="2026-08-02T00:04:30Z" AND textPayload:"Reset subscription credits"`
- 7021 matching entries: `timestamp>="2026-07-27T00:00:00Z" AND timestamp<="2026-08-02T01:00:00Z" AND textPayload:"Reset subscription credits"`
- 54 matching entries: `resource.labels.service_name="changelogtriggers-shops" AND timestamp>="2026-08-02T00:00:00Z" AND timestamp<="2026-08-02T00:15:00Z" AND logName="projects/avada-seo/logs/run.googleapis.com%2Fvarlog%2Fsystem"`
- 6035 matching entries: `resource.labels.service_name="onupdateshopgen2" AND timestamp>="2026-08-02T00:03:00Z" AND timestamp<="2026-08-02T00:04:00Z" AND logName="projects/avada-seo/logs/run.googleapis.com%2Frequests"`
- 776 matching entries: `resource.labels.service_name="changelogtriggers-shops" AND timestamp>="2026-07-26T00:00:00Z" AND textPayload:"no available instance"`

## Job
- analyze rounds: 1
- cost: $2.30

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
