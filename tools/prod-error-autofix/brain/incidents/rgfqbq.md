fingerprint: rgfqbq
service: syncelasticsearchchunkgen2
message: The request has been terminated because it has reached the maximum request timeout. To change this limit, see <https://cloud.google.com/run/docs/configuring/request-timeout>
app: SEO
repo: seo
date: 2026-08-22T04:41:13.959Z
status: fix_disabled
attempt: 1

# SEO · syncelasticsearchchunkgen2 · rgfqbq

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** syncElasticsearchChunkGen2 declares no `concurrency`, so Cloud Run runs it at the gen2 default of 80 requests per 1-vCPU/2GiB container (verified live: containerConcurrency=80, cpu=1), and syncToElasticsearch publishes every chunk of a resource type in one un-paced Promise.all — 27 product chunks for shop H1tQ5q9SbUGZOYNNuLNY arrived within 130ms and 27 ran simultaneously inside a single container, so per-chunk wall time went from 2.9-26.3s to 178-468s and 47 deliveries hit the declared timeoutSeconds: 540 exactly.

**Mechanism.** jobDataMigrate.service.js:215 dispatches all chunks of a resource type in a single Promise.all with no pacing; CHUNK_SIZE is 100 items (:47) and each chunk crawls its items at pLimit(CRAWL_CONCURRENCY=5) (:294, :48). The gen2 declaration at pubsubFunctions.js:382 sets memory/timeout/maxInstances/retry but never `concurrency`, so Cloud Run keeps the default 80 — confirmed on the live service (`gcloud run services describe syncelasticsearchchunkgen2`: containerConcurrency=80, cpu=1, memory=2Gi). Log proof of the packing: all 27 messages have a request start between 2026-08-20T13:56:34.111Z and .238Z, all on instanceId 00a41e8c1db4…, and an interval-overlap computation over (start, start+latency) for that instance gives max 27 requests in flight at once — i.e. up to 27x5=135 concurrent Shopify/storefront calls plus 27 concurrent cheerio + html-to-text parses on one vCPU. The contrast is the falsifier: the 9 chunk messages that ran earlier at low occupancy (13:51:21-13:52:15, 3 in flight) returned 204 in 2.912s, 3.925s, 4.238s, 8.098s, 17.883s and 26.263s; the same handler under 27-way occupancy returned 204 in 178.3-468.3s or was killed at 540.000-540.003s. 47 of 85 deliveries in the window are 504 at that exact value, matching pubsubFunctions.js:387 `timeoutSeconds: 540` to the millisecond. `retry: true` (:389) then redelivered every killed message — only 27 distinct cloud_event_ids produced the 57 failures (9 msgs x3 deliveries, 9 x2, 8 x1, 1 x4), which re-amplified the same burst; all 27 eventually returned 204, so no chunk was lost, but 47 x 540s x 2GiB was burned. The same overload is what produced the 10 non-timeout 500s: 27 concurrent initShopify clients for one shop exhaust that shop's REST bucket, and `shopify.shop.get({fields: 'password_enabled'})` at jobDataMigrate.service.js:276 sits bare inside the Promise.all with no shopifyRetry and no try/catch, so its 429 propagates out of processElasticsearchChunk — 10 stderr lines `[subscribeSyncElasticsearchChunk] H1tQ5q9SbUGZOYNNuLNY products <n> Response code 429` for chunks 2,3,4,12,16,21,22,23,25,26, exactly matching the 10 requests with latency 3.88-89.57s. The sibling `shopify.asset.get` at :281 takes the same 429 18 times but is inside a try/catch, so it only logs. This is the already-recorded fingerprint 7aq1ka defect, still unpatched in this worktree (line 276 is the bare call), reappearing as a symptom of the same fan-out — not a second cause.

Confidence: `high`

## Code
- `packages/functions/src/handlers/exports/pubsubFunctions.js:382` — syncElasticsearchChunkGen2 declaration — sets memory/timeoutSeconds/maxInstances/retry but no `concurrency`, so Cloud Run keeps the gen2 default 80 per 1-vCPU container
- `packages/functions/src/handlers/exports/pubsubFunctions.js:387` — timeoutSeconds: 540 — the limit the 47 kills match to the millisecond (540.000-540.003s)
- `packages/functions/src/handlers/exports/pubsubFunctions.js:389` — retry: true — turns each 540s kill into a redelivery; 27 messages produced 57 failed deliveries
- `packages/functions/src/services/jobDataMigrate.service.js:215` — every chunk of the resource type is dispatched in one Promise.all with no pacing — the source of the 27-message burst inside 130ms
- `packages/functions/src/services/jobDataMigrate.service.js:294` — each chunk crawls at pLimit(5), so 27 co-resident chunks put ~135 concurrent HTTP calls and parses on one vCPU
- `packages/functions/src/services/jobDataMigrate.service.js:47` — CHUNK_SIZE = 100 — with ~2700 products this yields the 27 chunks observed
- `packages/functions/src/services/jobDataMigrate.service.js:276` — bare, unretried shopify.shop.get inside Promise.all — its 429 under the self-inflicted throttle is the 10 non-timeout 500s (fingerprint 7aq1ka, still unpatched here)

## Evidence
- 47 matching entries: `resource.labels.service_name="syncelasticsearchchunkgen2" AND timestamp>="2026-08-20T13:50:36.551Z" AND timestamp<="2026-08-20T14:20:36.551Z" AND logName:"run.googleapis.com%2Frequests" AND httpRequest.status=504`
- 28 matching entries: `resource.labels.service_name="syncelasticsearchchunkgen2" AND timestamp>="2026-08-20T13:50:36.551Z" AND timestamp<="2026-08-20T14:20:36.551Z" AND logName:"run.googleapis.com%2Frequests" AND httpRequest.status=204`
- 85 matching entries: `resource.labels.service_name="syncelasticsearchchunkgen2" AND timestamp>="2026-08-20T13:50:36.551Z" AND timestamp<="2026-08-20T14:20:36.551Z" AND logName:"run.googleapis.com%2Frequests"`
- 10 matching entries: `resource.labels.service_name="syncelasticsearchchunkgen2" AND timestamp>="2026-08-20T13:50:36.551Z" AND timestamp<="2026-08-20T14:20:36.551Z" AND logName:"stderr" AND textPayload:"subscribeSyncElasticsearchChunk"`
- 18 matching entries: `resource.labels.service_name="syncelasticsearchchunkgen2" AND timestamp>="2026-08-20T13:50:36.551Z" AND timestamp<="2026-08-20T14:20:36.551Z" AND logName:"stderr" AND textPayload:"Error getting theme asset"`
- 57 matching entries: `resource.labels.service_name="syncelasticsearchchunkgen2" AND timestamp>="2026-08-20T13:50:36.551Z" AND timestamp<="2026-08-20T14:20:36.551Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $3.26

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
