fingerprint: klsiut
service: apisagen2
message: HTTP 504 GET /apiSa/resource-report
app: SEO
repo: seo
date: 2026-09-01T08:31:04.612Z
status: fix_disabled
attempt: 2

# SEO · apisagen2 · klsiut

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** GET /apiSa/resource-report recomputes a full Shopify catalog scan inline on the request thread with no cross-request dedup and no throttle retry, so shop ScPYO6AfYjTJVQrebap4's 43 overlapping calls in 30 minutes each ran the same serial 250-node-per-page GraphQL walk, exhausted that shop's Shopify GraphQL cost bucket (44 `Throttled` errors), and two of the surviving scans ran past apiSaGen2's `timeoutSeconds: 540` and were killed by Cloud Run as the alerted 504s.

**Mechanism.** Both alerted requests have latency 539.999639370s and 539.999714555s against `timeoutSeconds: 540` declared on apiSaGen2 (packages/functions/src/handlers/exports/httpFunctions.js:55) — P4, that identifies which limit fired. Neither carries an application log line, because the container was killed mid-request so the controller's catch at analysisController.js:293 never ran. The route is analysisController.getResourceReport (routes/api.js:220). Its only unbounded work is countResourcesWithFaq (analysisController.js:263), a serial `while (hasNext)` cursor walk (generateBulkService.js:266) across all four resource types at FAQ_SCAN_PAGE_SIZE = 250 (generateBulkService.js:182), each page an expensive document where every one of the 250 nodes also pulls `faqMetafields: metafields(namespace:"faqs", first: 250)` plus images and two metafield lookups (graphql/query/products/productsPaginated.graphql:23). There is no page cap, no time budget and no early exit. Three code facts turn that into the observed 504 burst. (1) No single-flight: 43 requests to this one endpoint landed in the 30-minute window, latencies spread 0.168s (a cache hit) → 9.5s → 69s → 116s → 295s → 421s → 489s → 540s, i.e. every new call starts its own full scan while previous scans are still walking, and all of them share one shop's Shopify GraphQL cost bucket. (2) No throttle retry: analysisController.js:261 builds the client as `initShopify(shop, {autoLimit: true, maxRetries: 0})`, and shopifyService.js:77 resolves that to `autoLimit: autoLimit && !maxRetries` = true — but autoLimit is the REST leaky-bucket only. fetchTabPage issues a bare `shopify.graphql(...)` (generateBulkService.js:338) that is never wrapped in this repo's own `shopifyRetryGraphQL` (shopifyService.js:547), which exists precisely to back off on `extensions.code === 'THROTTLED'` (shopifyService.js:536-537). So one cost-limit hit aborts an entire multi-minute scan: 44 log lines `[getResourceReport] ScPYO6AfYjTJVQrebap4 Throttled RequestError: Throttled` with the stack in shopify-api-node/index.js:299 `maybeError`, all one shop. (3) No partial progress: saveResourceReportCache is reached only after the whole scan completes (analysisController.js:276 and :290), and the catch answers 200 with `success:false` (analysisController.js:294), so every throttled or timed-out attempt caches nothing and the FE's TanStack query (packages/assets/src/pages/AiContent/Report.js:23, duplicated in GenerateBulk.js:96) re-asks against an empty cache; the merchant's Scan button sets `refresh=true` (Report.js:35), which skips the cache check at analysisController.js:248 outright — 8 of the 43 requests carry it. Not instance sickness and not infra: the two kills are exact timeout matches, not OOM, and the window's non-request log lines are all this same Throttled family.

Confidence: `high`

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:55` — apiSaGen2 declares timeoutSeconds: 540 — the limit both alerted requests hit at 539.9996s
- `packages/functions/src/routes/api.js:220` — route registration mapping /resource-report to analysisController.getResourceReport
- `packages/functions/src/controllers/analysisController.js:263` — the request thread awaits the full catalog scan inline — the only unbounded work in the handler
- `packages/functions/src/controllers/analysisController.js:261` — client built with maxRetries: 0; autoLimit is REST-only, so GraphQL cost throttling is unhandled
- `packages/functions/src/services/generateBulkService.js:338` — fetchTabPage issues a bare shopify.graphql() — not wrapped in shopifyRetryGraphQL, so one THROTTLED kills the whole scan
- `packages/functions/src/services/shopifyService.js:547` — shopifyRetryGraphQL — the repo's existing THROTTLED backoff helper this call path bypasses
- `packages/functions/src/services/shopifyService.js:77` — autoLimit: autoLimit && !maxRetries — confirms autoLimit is on but covers REST buckets only
- `packages/functions/src/services/generateBulkService.js:266` — unbounded serial `while (hasNext)` cursor loop over all four tabs — no page cap, no deadline, no early exit
- `packages/functions/src/services/generateBulkService.js:182` — FAQ_SCAN_PAGE_SIZE = 250 — page size of the scan
- `packages/functions/src/graphql/query/products/productsPaginated.graphql:23` — each of the 250 nodes per page also pulls metafields(first: 250), making each page very expensive in GraphQL cost points
- `packages/functions/src/controllers/analysisController.js:290` — cache written only after the entire scan finishes, so a throttled or timed-out shop never caches and every retry rescans from scratch
- `packages/functions/src/controllers/analysisController.js:293` — the catch that emitted the 44 '[getResourceReport] ScPYO6AfYjTJVQrebap4 Throttled' lines, answering 200 success:false instead of surfacing the failure
- `packages/functions/src/controllers/analysisController.js:248` — refresh=true bypasses the 10-minute cache entirely — 8 of the 43 window requests carry it
- `packages/assets/src/pages/AiContent/Report.js:35` — the Scan button sets refresh=true and refetches, adding a fresh full rescan per click

## Evidence
- 2 matching entries: `resource.labels.service_name="apisagen2" AND httpRequest.requestUrl:"/apiSa/resource-report" AND httpRequest.status=504 AND timestamp>="2026-09-01T08:11:35Z" AND timestamp<="2026-09-01T08:41:35Z"`
- 44 matching entries: `resource.labels.service_name="apisagen2" AND textPayload:"[getResourceReport]" AND textPayload:"Throttled" AND timestamp>="2026-09-01T08:11:35Z" AND timestamp<="2026-09-01T08:41:35Z"`
- 43 matching entries: `resource.labels.service_name="apisagen2" AND httpRequest.requestUrl:"/apiSa/resource-report" AND timestamp>="2026-09-01T08:11:35Z" AND timestamp<="2026-09-01T08:41:35Z"`
- 12 matching entries: `resource.labels.service_name="apisagen2" AND httpRequest.requestUrl:"/apiSa/resource-report" AND httpRequest.status=200 AND timestamp>="2026-09-01T07:30:00Z" AND timestamp<="2026-09-01T08:00:00Z"`

## Job
- analyze rounds: 1
- cost: $2.55

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
