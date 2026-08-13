fingerprint: 7aq1ka
service: syncelasticsearchchunkgen2
message: HTTP 500 POST /
app: SEO
repo: seo
date: 2026-08-12T15:47:29.427Z
status: mr_open
attempt: 1

# SEO · syncelasticsearchchunkgen2 · 7aq1ka

**Outcome.** MR opened: https://gitlab.com/avada/seo/-/merge_requests/2176

**Root cause.** processElasticsearchChunk fires `shopify.shop.get({fields:'password_enabled'})` as a bare, unretried Shopify REST call inside the chunk's opening Promise.all, so when 20 concurrent chunks of one shop's product sync drain that shop's REST bucket, the 429 propagates out of the chunk handler and every chunk returns HTTP 500.

**Mechanism.** All 182 500s in the window are one shop (9kVRBBOnNz3aJ6s3t3sf, the-argus-collection.myshopify.com), one resourceType (`products`), 47 distinct chunkIndexes redelivered 1-6x each in 2m49s (20:08:58 -> 20:11:47). syncElasticsearchChunkGen2 is declared maxInstances: 20 + retry: true (handlers/exports/pubsubFunctions.js:388-389), and syncToElasticsearch dispatches every chunk of the stage in one Promise.all, so ~20 chunks of the same shop run at once. Each chunk opens with a 4-way Promise.all (jobDataMigrate.service.js:268): getMainThemeId -> theme.list is wrapped in shopifyRetryApi and swallows its own error (shopifyService.js:202-218, returns false); getPrimaryLocale is wrapped in shopifyRetryGraphQL (:274 — its 50-attempt backoff is the >5000 `[shopifyRetryGraphQL] GraphQL THROTTLED` lines); getSettings is Firestore. Only `shopify.shop.get(...)` at :276 has no retry wrapper and no catch — initShopify builds the client with maxRetries: 0 (shopifyService.js:63,77), so shopify-api-node's got throws HTTPError 'Response code 429 (Too Many Requests)' straight out. One rejected member rejects the whole Promise.all, the throw escapes processElasticsearchChunk, subscribeSyncElasticsearchChunk logs `[subscribeSyncElasticsearchChunk] <shopId> products <chunkIndex> Response code 429` and rethrows (subscribeSyncElasticsearchChunk.js:21,32) -> 500 -> Pub/Sub redelivers (retry: true) -> more concurrent REST calls against the same exhausted bucket -> self-sustaining storm until the bucket recovers. Proof the failure is upstream of the per-item work: zero `Error fetching resource` lines in the window despite 182 chunk failures, and 500 latency median 5.79s / min 0.34s. The 35 `Error getting theme asset ... 429` lines are the same throttle hitting shopify.asset.get at :282, which IS caught and so does not 500. The 22 `Cannot mark chunk as failed ... ABORTED: cross-transaction contention` lines are secondary damage — 20 concurrent failure paths all running settleElasticsearchChunk's transaction on the same job doc.

Confidence: `high`

## Code
- `packages/functions/src/services/jobDataMigrate.service.js:276` — the defect: shopify.shop.get is the only Shopify REST call in this function with neither shopifyRetryApi nor a try/catch — a 429 here kills the whole chunk
- `packages/functions/src/services/jobDataMigrate.service.js:268` — Promise.all — one rejected member rejects all four, before any per-item work runs (explains zero 'Error fetching resource' logs)
- `packages/functions/src/services/jobDataMigrate.service.js:274` — the same class of bug already fixed for getPrimaryLocale, with the comment at :270-273 stating the exact failure mode now hitting :276
- `packages/functions/src/services/jobDataMigrate.service.js:282` — shopify.asset.get takes the same 429 but is caught — 35 logged, 0 of them 500ed; the contrast pins the escape point
- `packages/functions/src/services/shopifyService.js:202` — getMainThemeId wraps theme.list in shopifyRetryApi AND catches, returning false — rules it out as the throw
- `packages/functions/src/services/shopifyService.js:485` — shopifyRetryApi — the existing retry-after/backoff wrapper the :276 call should use
- `packages/functions/src/services/shopifyService.js:77` — initShopify sets maxRetries: 0, so a raw REST 429 throws immediately instead of being retried by the client
- `packages/functions/src/handlers/pubsub/subscribeSyncElasticsearchChunk.js:32` — rethrow turns the 429 into the HTTP 500 the alert fired on
- `packages/functions/src/handlers/pubsub/subscribeSyncElasticsearchChunk.js:21` — the exact log line counted 182x — '[subscribeSyncElasticsearchChunk] <shopId> <resourceType> <chunkIndex> <e.message>'
- `packages/functions/src/handlers/exports/pubsubFunctions.js:388` — maxInstances: 20 — 20 chunks of the same shop hit one shared REST bucket concurrently
- `packages/functions/src/handlers/exports/pubsubFunctions.js:389` — retry: true — every 500 is redelivered, amplifying the throttle (47 chunks -> 182 failures)
- `packages/functions/src/services/jobDataMigrate.service.js:215` — syncToElasticsearch dispatches every chunk in one Promise.all with no pacing, creating the concurrent burst

## Evidence
- 182 matching entries: `(resource.labels.service_name="syncelasticsearchchunkgen2") AND timestamp>="2026-08-07T20:08:00Z" AND timestamp<="2026-08-07T20:12:30Z" AND logName:"stderr" AND textPayload:"subscribeSyncElasticsearchChunk] 9kV"`
- 182 matching entries: `(resource.labels.service_name="syncelasticsearchchunkgen2") AND timestamp>="2026-08-07T19:55:09.519Z" AND timestamp<="2026-08-07T20:25:09.519Z" AND httpRequest.status>=500`
- 93 matching entries: `(resource.labels.service_name="syncelasticsearchchunkgen2") AND timestamp>="2026-08-07T20:08:00Z" AND timestamp<="2026-08-07T20:12:30Z" AND logName:"stderr" AND textPayload:"HTTPError"`
- 35 matching entries: `(resource.labels.service_name="syncelasticsearchchunkgen2") AND timestamp>="2026-08-07T20:08:00Z" AND timestamp<="2026-08-07T20:12:30Z" AND textPayload:"Error getting theme asset"`
- 5000 matching entries: `(resource.labels.service_name="syncelasticsearchchunkgen2") AND timestamp>="2026-08-07T20:08:00Z" AND timestamp<="2026-08-07T20:12:30Z" AND textPayload:"THROTTLED"`
- 22 matching entries: `(resource.labels.service_name="syncelasticsearchchunkgen2") AND timestamp>="2026-08-07T20:08:00Z" AND timestamp<="2026-08-07T20:12:30Z" AND textPayload:"Cannot mark chunk as failed"`

## Job
- analyze rounds: 1
- cost: $5.45
- branch: `fix/prod-seo-7aq1ka`
- fix commit: `6746fd0c5616c90160051bbc236f3a1b5e5860f5`
- MR: https://gitlab.com/avada/seo/-/merge_requests/2176
- tests: 926 tests, 6 failing · baseline 6 failing · reproduce test fails without the fix

```
packages/functions/src/services/jobDataMigrate.service.js | 9 +++++++--
 1 file changed, 7 insertions(+), 2 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
