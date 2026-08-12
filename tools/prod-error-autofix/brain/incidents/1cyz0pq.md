fingerprint: 1cyz0pq
service: webHookHandlerSubscriber
message: The request was aborted because there was no available instance. Additional troubleshooting documentation can be found at: <https://cloud.google.com/functions/docs/troubleshooting#scalability>
app: IMG-OPT
repo: avada-image-optimizer
date: 2026-08-12T05:19:14.076Z
status: infra
attempt: 1

# IMG-OPT · webHookHandlerSubscriber · 1cyz0pq

**Outcome.** infra class — reported, no MR

**Root cause.** The 19:00 UTC dailyJobsPublisher fan-out published count-image bulk queries for all 5624 active shops at once, so Shopify returned 5691 bulk_operations/finish webhooks in two minutes; webhookBulkOperation republished every one to the handleWebhook topic, and gen1 webHookHandlerSubscriber (4GB, 1 request per instance, no maxInstances) could not scale fast enough — the platform aborted 28 push deliveries with 'no available instance' during a 5.8-second scale-up gap at 19:00:53.8–19:00:59.6Z.

**Mechanism.** dailyJobsPublisher is declared '0 12 * * *' with no .timeZone() (packages/functions/src/index.js:101), so Firebase runs it in the default America/Los_Angeles zone = 19:00 UTC in August; the log shows it started 2026-08-04T19:00:11.845Z and printed 'countImages publisher 5624'. countImages chunks those shops by 50 and publishes every chunk in one Promise.all (packages/functions/src/handlers/cron/dailyJobs.js:13), and handleCountImages creates a bulk operation for all 50 shops of a chunk concurrently (packages/functions/src/handlers/pubsub/countImagesHandler.js:8). The count queries are small, so Shopify fired the whole fleet's finish webhooks back inside one minute: webhookBulkOperation logged 5691 'start hook' lines in 19:00–19:01Z (4997 in the 19:00 minute alone). Each one calls publishTopic('handleWebhook', ...) (packages/functions/src/handlers/webhook/bulkOperationHook.js:101), turning the webhook wave into an identically-shaped PubSub wave on the handleWebhook topic. webHookHandlerSubscriber is a gen1 functions.pubsub.topic().onPublish declared memory '4GB', timeoutSeconds 540, failurePolicy true and NO maxInstances/concurrency (packages/functions/src/index.js:152-158), so gen1's 1-request-per-instance model needs one 4GB instance per in-flight message. It only got 154 executions started in the 19:00 minute and then 4769 in the 19:01 minute — 802+ distinct instance_ids observed across 19:00–19:02Z. All 28 aborts land in the 5.8s window while that scale-up was still in flight; each is a 500 on the PubSub push endpoint POST /_ah/push-handlers/pubsub/.../topics/handleWebhook with no application log line, because the platform rejected the request before user code ran. Not data loss: PubSub push retries a 500, and failurePolicy:true plus the saveWebhookLog dedup makes redelivery idempotent. Separately and NOT the cause of this alert: the same window shows 327 stack lines of 'TypeError: histories.forEach is not a function' from handleCountImage — `const [data, histories = []] = await Promise.all([largeDataApi(...), isGetHistories && getHistoriesAfterDate(...)])` (packages/functions/src/handlers/webhook/bulkOperationHook.js:636) yields `false`, not `undefined`, when isGetHistories is false, so the `= []` default never applies and getCountData (packages/functions/src/services/email/index.js:389) throws. That one is swallowed by the local catch, so it produces no 500 — but it aborts updateAnalysisByShopId, meaning the daily count silently never lands for those shops.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/index.js:152` — webHookHandlerSubscriber is gen1 functions.pubsub.topic('handleWebhook').onPublish — 1 concurrent execution per instance
- `packages/functions/src/index.js:156` — runWith({memory: '4GB', timeoutSeconds: 540, failurePolicy: true}) — no maxInstances, no concurrency; 4GB per instance makes scale-up the slowest of any subscriber in the repo
- `packages/functions/src/index.js:101` — dailyJobsPublisher schedule '0 12 * * *' with no .timeZone() -> America/Los_Angeles default -> 19:00 UTC, matching the observed 19:00:11.845Z run
- `packages/functions/src/handlers/cron/dailyJobs.js:13` — all 5624 active shops chunked by 50 and every chunk published in a single Promise.all — no stagger, so the whole fleet's bulk ops start together
- `packages/functions/src/handlers/pubsub/countImagesHandler.js:8` — each chunk creates its 50 bulk operations concurrently, so the finish webhooks return as one synchronized wave
- `packages/functions/src/handlers/webhook/bulkOperationHook.js:101` — every finish webhook is republished to the handleWebhook topic, converting the webhook burst 1:1 into the PubSub burst that overran webHookHandlerSubscriber
- `packages/functions/src/handlers/webhook/bulkOperationHook.js:636` — `histories = []` default never applies because `isGetHistories && ...` returns false, not undefined — source of the 327 concurrent TypeError lines (separate defect, not this alert)
- `packages/functions/src/services/email/index.js:389` — histories.forEach on that false value is the throw site of 'histories.forEach is not a function'

## Evidence
- 28 matching entries: `resource.labels.function_name="webHookHandlerSubscriber" AND timestamp>="2026-08-04T18:47:29Z" AND timestamp<="2026-08-04T19:17:30Z" AND textPayload:"no available instance"`
- 3 matching entries: `resource.labels.function_name="dailyJobsPublisher" AND timestamp>="2026-08-04T18:55:00Z" AND timestamp<="2026-08-04T19:05:00Z"`
- 5691 matching entries: `resource.labels.function_name="webhookBulkOperation" AND timestamp>="2026-08-04T19:00:00Z" AND timestamp<"2026-08-04T19:02:00Z" AND textPayload:"start hook"`
- 4769 matching entries: `resource.labels.function_name="webHookHandlerSubscriber" AND timestamp>="2026-08-04T19:01:00Z" AND timestamp<"2026-08-04T19:02:00Z" AND textPayload:"Function execution started"`
- 512 matching entries: `resource.labels.function_name="webHookHandlerSubscriber" AND timestamp>="2026-08-04T19:00:00Z" AND timestamp<"2026-08-04T19:01:00Z" AND textPayload:"Function execution started"`
- 8 matching entries: `resource.labels.function_name="webHookHandlerSubscriber" AND timestamp>="2026-08-04T19:00:00Z" AND timestamp<"2026-08-04T19:02:00Z" AND textPayload:"histories.forEach is not a function"`

## Job
- analyze rounds: 2
- cost: $3.60

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
