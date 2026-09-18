fingerprint: vspx0a
service: syncelasticsearchchunkgen2
message: The request was aborted because there was no available instance. Additional troubleshooting documentation can be found at: <https://cloud.google.com/run/docs/troubleshooting#abort-request>
app: SEO
repo: seo
date: 2026-09-18T04:37:51.595Z
status: infra
attempt: 1

# SEO · syncelasticsearchchunkgen2 · vspx0a

**Outcome.** infra class — reported, no MR

**Root cause.** The alerted 'no available instance' 500 was a scale-from-zero race. At 2026-09-18T04:34:37Z, a single syncToElasticsearch fan-out for shop fBevbl6gyIg85h49MFJZ sent 12 Pub/Sub pushes at the same moment to syncelasticsearchchunkgen2. The service had served nothing since 2026-09-17T23:3x (~5h at zero instances), and Cloud Run aborted 1 of the 12 pushes before any of the 9 instances it was starting existed.

**Mechanism.** At 04:34:31.478Z handlehooksubscribergen2 logs `[handleHook] fBevbl6gyIg85h49MFJZ gid://shopify/BulkOperation/8399247179934 bulk_operations/finish`, and at 04:34:34.87Z it logs `purged stale docs ... products`. syncToElasticsearch (jobDataMigrate.service.js:203) then splits the export into chunks and calls dispatchWork('syncElasticsearchChunk', ...) for every chunk at once inside one Promise.all (:259-269). The failing chunk indices include 23, so there were at least 24 chunks. 12 of those pushes reached GCF. Every one of the 12 request-log entries is stamped 04:34:37.382–.393Z. The 'Starting new instance. Reason: AUTOSCALING' entries come after that, at 04:34:37.401–.458Z: 9 of them, and none earlier in the window. The first `STARTUP TCP probe succeeded` is at 04:34:52.151Z. The single abort (04:34:37.393846Z, latency 0s, no instanceId) never reached a container. It is a platform capacity miss, not app code. The service config rules out the instance cap: maxScale 20 (pubsubFunctions.js:388) and only 9 instances started; containerConcurrency is 80. The other 9 of the 10 500s in the window share this alert's fingerprint but have a different cause. All 9 ran on instance 00a41e8c1d144ee4…, and each corresponds to a `[subscribeSyncElasticsearchChunk] fBevbl6gyIg85h49MFJZ products <idx> Response code 429 (Too Many Requests)` line logged between 04:34:57.146Z and 04:34:57.260Z (chunks 1,6,7,9,10,14,16,17,23). The chunks all started at the same time and called Shopify REST for the same shop together. One such call is the bare, unretried `shopify.shop.get({fields:'password_enabled'})` at jobDataMigrate.service.js:321, and it sits outside any try/catch. The handler rethrows (subscribeSyncElasticsearchChunk.js:32). That 429 family is already recorded as 7aq1ka (MR 2176). Line 321 is still bare on this branch, so that fix is not in the code here. Open item: the subscription has retryPolicy 10s–600s and an ackDeadline of 600s, yet no redelivery of any of the 10 failed messages shows up in the request log through 06:30Z. Whether those chunks were lost is not established from logs.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/services/jobDataMigrate.service.js:259` — Promise.all dispatches every chunk at once: this is the instant burst that hit a zero-instance service
- `packages/functions/src/handlers/exports/pubsubFunctions.js:382` — syncElasticsearchChunkGen2 has no minInstances, so after ~5h idle it sits at 0 when the burst arrives
- `packages/functions/src/handlers/exports/pubsubFunctions.js:388` — maxInstances 20; only 9 instances were started, so the cap was not the limit
- `packages/functions/src/services/jobDataMigrate.service.js:321` — Separate cause behind the same fingerprint: this Shopify REST call is unretried and outside a try/catch, and it runs in every concurrent chunk for one shop, which fits the 9× 429s
- `packages/functions/src/handlers/pubsub/subscribeSyncElasticsearchChunk.js:32` — Rethrows the 429, which turns each throttled chunk into an HTTP 500 on the push

## Evidence
- 1 matching entries: `resource.labels.service_name="syncelasticsearchchunkgen2" AND timestamp>="2026-09-18T04:20:04Z" AND timestamp<="2026-09-18T04:50:04Z" AND textPayload:"no available instance"`
- 12 matching entries: `resource.labels.service_name="syncelasticsearchchunkgen2" AND timestamp>="2026-09-18T04:30:00Z" AND timestamp<="2026-09-18T04:40:00Z" AND logName:"requests"`
- 9 matching entries: `resource.labels.service_name="syncelasticsearchchunkgen2" AND timestamp>="2026-09-18T04:30:00Z" AND timestamp<="2026-09-18T04:40:00Z" AND textPayload:"Starting new instance"`
- 9 matching entries: `resource.labels.service_name="syncelasticsearchchunkgen2" AND timestamp>="2026-09-18T04:30:00Z" AND timestamp<="2026-09-18T04:40:00Z" AND textPayload:"[subscribeSyncElasticsearchChunk] fBevbl6gyIg85h49MFJZ products"`
- 3 matching entries: `resource.labels.service_name="handlehooksubscribergen2" AND timestamp>="2026-09-18T04:30:00Z" AND timestamp<="2026-09-18T04:40:00Z" AND textPayload:"fBevbl6gyIg85h49MFJZ"`
- 97 matching entries: `resource.labels.service_name="syncelasticsearchchunkgen2" AND timestamp>="2026-09-17T04:00:00Z" AND timestamp<="2026-09-18T06:00:00Z" AND logName:"requests"`

## Job
- analyze rounds: 1
- cost: $2.22

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
