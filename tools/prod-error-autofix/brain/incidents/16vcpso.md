fingerprint: 16vcpso
service: apisagen2
message: HTTP 500 POST /apiSa/genFaqBulk
app: SEO
repo: seo
date: 2026-08-24T09:45:30.998Z
status: fix_disabled
attempt: 1

# SEO · apisagen2 · 16vcpso

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** POST /apiSa/genFaqBulk returned 500 because a Shopify Admin GraphQL THROTTLED error reached generateBulkController.create's catch unretried — the Shopify client that path builds is created with maxRetries: 0 and none of its calls are wrapped in the withShopifyRetry helper that already exists in the same file.

**Mechanism.** The alerted request log (2026-08-24T09:38:30.093068Z, latency 140.207677790s) ends at 09:40:50.3007; the stderr line `[create] HM3hQyobi8tfS4zMmkkL Throttled RequestError: Throttled ... extensions: {code: 'THROTTLED'}` is stamped 09:40:50.300201Z — a 0.5 ms match, so the alert and that log line are the same request. `[create]` is the logger tag in generateBulkController.js:60, whose catch sets ctx.status = 500 for any non-MSG_META_LIMIT error (generateBulkController.js:62). The throw comes from a `shopify.graphql` call: the stack is shopify-api-node/index.js:299 `maybeError` over got. Every Shopify client on this path is built by initShopify, whose defaults are `autoLimit = true, maxRetries = 0` (shopifyService.js:63) — `autoLimit` is shopify-api-node's REST leaky-bucket pacing and does nothing for GraphQL cost throttling, and maxRetries: 0 means the library does not retry. createGenFaqBulk builds its client with no options at all (generateBulkService.js:90). The same file's fetchTabPage issues a bare, unguarded `shopify.graphql` (generateBulkService.js:338). The file's own retry/backoff helper `withShopifyRetry` (generateBulkController.js:107) and its 429 response branch (generateBulkController.js:252-259) are used only by `getResources`; `create` is not wrapped in it, so one THROTTLED becomes an HTTP 500 instead of a retry or a 429. The 140.2 s latency and the shop's concurrent throttle storm point at the isAuto branch, which calls countResourcesWithFaq (generateBulkService.js:98) — an unbounded serial walk of the whole catalog, 4 resource types x 250-item pages in a `while (hasNext)` loop (generateBulkService.js:266-280) with no page cap, no concurrency limit and no backoff. That same countResourcesWithFaq is what analysisController.getResourceReport calls (analysisController.js:263), and it threw THROTTLED 25 times for this same shop HM3hQyobi8tfS4zMmkkL inside the 30-minute window — one exhausted GraphQL cost bucket, two symptoms.

Confidence: `high`

## Code
- `packages/functions/src/controllers/generateBulkController.js:62` — create's catch maps any non-MSG_META_LIMIT error, including Shopify THROTTLED, to ctx.status = 500 — this is the line that produced the alerted HTTP 500
- `packages/functions/src/controllers/generateBulkController.js:60` — logger.error('[create]', shopID, ...) — emits the `[create] HM3hQyobi8tfS4zMmkkL Throttled` stderr line whose timestamp matches the request end to 0.5 ms
- `packages/functions/src/controllers/generateBulkController.js:107` — withShopifyRetry (4 attempts, exponential backoff from 800 ms) already exists in this file but is applied only in getResources; create never calls it
- `packages/functions/src/controllers/generateBulkController.js:252` — getResources' throttle branch answers 429 'Shopify rate limit, please retry' — the correct handling that create lacks
- `packages/functions/src/services/shopifyService.js:63` — initShopify defaults maxRetries = 0, so shopify-api-node never retries a THROTTLED GraphQL response; autoLimit only paces REST
- `packages/functions/src/services/generateBulkService.js:90` — createGenFaqBulk builds its Shopify client with initShopify(shop) and no options — inherits maxRetries: 0
- `packages/functions/src/services/generateBulkService.js:338` — fetchTabPage issues a bare shopify.graphql with no retry or throttle guard — the call site that raises THROTTLED
- `packages/functions/src/services/generateBulkService.js:266` — countResourcesWithFaq's unbounded `while (hasNext)` full-catalog scan, 4 tabs x 250/page, serial and uncapped — the cost-bucket drain consistent with the 140.2 s latency
- `packages/functions/src/controllers/analysisController.js:263` — getResourceReport calls the same countResourcesWithFaq, producing the 25 concurrent THROTTLED lines for the same shop — one cause, two symptoms

## Evidence
- 1 matching entries: `resource.labels.service_name="apisagen2" AND timestamp>="2026-08-24T09:26:00Z" AND timestamp<="2026-08-24T09:56:00Z" AND httpRequest.status>=500`
- 1 matching entries: `resource.labels.service_name="apisagen2" AND timestamp>="2026-08-24T09:26:00Z" AND timestamp<="2026-08-24T09:56:00Z" AND textPayload:"[create]" AND textPayload:"Throttled"`
- 25 matching entries: `resource.labels.service_name="apisagen2" AND timestamp>="2026-08-24T09:26:00Z" AND timestamp<="2026-08-24T09:56:00Z" AND textPayload:"[getResourceReport]" AND textPayload:"Throttled"`

## Job
- analyze rounds: 1
- cost: $3.24

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
