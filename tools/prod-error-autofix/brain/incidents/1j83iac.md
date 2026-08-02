fingerprint: 1j83iac
service: subscribeupdatenewsubscribercreditshandlergen2
message: The request was aborted because there was no available instance. Additional troubleshooting documentation can be found at: <https://cloud.google.com/run/docs/troubleshooting#abort-request>
app: SEO
repo: seo
date: 2026-08-02T00:09:04.320Z
status: infra
attempt: 1

# SEO · subscribeupdatenewsubscribercreditshandlergen2 · 1j83iac

**Outcome.** infra class — reported, no MR

**Root cause.** The daily subscribeActiveCharge fan-out published all 179 updateSubscriberCredits batches in one Promise.all burst at 00:01:25.129Z against a Cloud Run service that had been scaled to zero for 2h+, and Cloud Run aborted 15 of the 179 push deliveries with 'no available instance' during the ~88s it took the first new instance to pass its startup probe.

**Mechanism.** packages/functions/src/handlers/pubsub/subscribeActiveCharge.js:45 chunks 8912 unique active-charge shops into BATCH_SIZE=50 groups (:7) and fires every chunk concurrently via `await Promise.all(batches.map(batch => dispatchWork('updateSubscriberCredits', batch)))`. Its own log line at 00:01:25.129570Z reads '10163 fetched, 8912 unique shops, 179 batches published' — one publish burst, no stagger. Eventarc push subscription eventarc-us-central1-subscribeupdatenewsubscribercreditshandlergen2-831721-sub-836 delivers those 179 messages to subscribeupdatenewsubscribercreditshandlergen2 immediately. That service is declared at packages/functions/src/handlers/exports/pubsubFunctions.js:301-302 with only {timeoutSeconds:540, memory:'2GiB', topic, ...vpcSettings} — no minInstances. `gcloud run services describe` confirms revision -00117-vor, containerConcurrency 80, autoscaling maxScale 100, no minScale annotation. The service served zero requests between 22:00:00Z and 00:01:25Z, so it was at 0 instances. Request log: 194 deliveries in 00:01:25–00:01:55, 179×200 and 15×500, across 14 distinct instanceIds. System log: 22 'Starting new instance. Reason: AUTOSCALING' orders from 00:01:25.640218Z to 00:03:13.115877Z, and the FIRST 'STARTUP TCP probe succeeded' only at 00:02:53.305931Z — an 87.7s capacity gap. All 15 aborts fall inside it (00:01:25.606302Z → 00:01:40.042484Z), all latency 0s, none carrying an instanceId — they never reached a container. maxScale 100 was never approached (14 instances), so the instance cap is not the constraint; scale-from-zero latency against a 179-message instant burst is. No data was lost: 179 of the batches returned 200 (p50 32.6s, max 174.1s per batch — each batch does 50 shops at pLimit(5) with a live Shopify getActiveSubscriptions call per shop, subscribeUpdateNewSubscriberCredits.js:87-91,150), and the subscription's retryPolicy (minimumBackoff 10s, ackDeadline 600s) redelivered the 15 aborted messages, which is why total deliveries (194) exceed batches published (179). The same fan-out publishes 178–179 batches every night 2026-07-27..2026-08-02, yet 'no available instance' appears exactly 15 times in 7 days, all in minute 00:01 of 2026-08-02 — this is a marginal race against autoscaler warm-up, not a new defect.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/pubsub/subscribeActiveCharge.js:45` — Promise.all publishes all 179 batches simultaneously — the burst that outruns scale-from-zero
- `packages/functions/src/handlers/pubsub/subscribeActiveCharge.js:7` — BATCH_SIZE = 50 → 8912 shops become 179 concurrent Pub/Sub messages
- `packages/functions/src/handlers/exports/pubsubFunctions.js:302` — subscribeUpdateNewSubscriberCreditsHandlerGen2 declared with no minInstances, so it sits at 0 instances until the nightly burst arrives
- `packages/functions/src/handlers/pubsub/subscribeUpdateNewSubscriberCredits.js:90` — pLimit(5) over 50 shops per message, each doing a Shopify getActiveSubscriptions call — why a single delivery runs 32–174s and instances stay busy
- `packages/functions/src/handlers/pubsub/subscribeUpdateNewSubscriberCredits.js:150` — the per-shop Shopify Admin call that dominates the 90–174s batch latency

## Evidence
- 15 matching entries: `resource.labels.service_name="subscribeupdatenewsubscribercreditshandlergen2" AND timestamp>="2026-08-01T23:55:00Z" AND timestamp<="2026-08-02T00:20:00Z" AND textPayload:"no available instance"`
- 194 matching entries: `resource.labels.service_name="subscribeupdatenewsubscribercreditshandlergen2" AND timestamp>="2026-08-01T23:55:00Z" AND timestamp<="2026-08-02T00:20:00Z" AND logName="projects/avada-seo/logs/run.googleapis.com%2Frequests"`
- 46 matching entries: `resource.labels.service_name="subscribeupdatenewsubscribercreditshandlergen2" AND timestamp>="2026-08-02T00:00:00Z" AND timestamp<="2026-08-02T00:06:00Z" AND logName="projects/avada-seo/logs/run.googleapis.com%2Fvarlog%2Fsystem"`
- 1 matching entries: `timestamp>="2026-08-01T23:58:00Z" AND timestamp<="2026-08-02T00:10:00Z" AND textPayload:"[subscribeActiveCharge]"`
- 7 matching entries: `timestamp>="2026-07-27T00:00:00Z" AND textPayload:"[subscribeActiveCharge] done"`
- 15 matching entries: `resource.labels.service_name="subscribeupdatenewsubscribercreditshandlergen2" AND timestamp>="2026-07-26T00:00:00Z" AND textPayload:"no available instance"`

## Job
- analyze rounds: 1
- cost: $1.71

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
