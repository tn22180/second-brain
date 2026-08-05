fingerprint: klsiut
service: apisagen2
message: HTTP 504 GET /apiSa/resource-report
app: SEO
repo: seo
date: 2026-08-04T15:49:35.028Z
status: inconclusive
attempt: 1

# SEO · apisagen2 · klsiut

**Outcome.** smoke gate reproduce_not_failing

**Root cause.** GET /apiSa/resource-report runs an unbounded, cache-miss-only full Shopify catalog scan inline on the request thread (countResourcesWithFaq), and on one large shop that scan exceeded apiSaGen2's configured timeoutSeconds: 540, so Cloud Run terminated 23 consecutive requests at exactly 540.000s.

**Mechanism.** Every one of the 23 failing requests has latency 540.000xxx s, matching `timeoutSeconds: 540` on apiSaGen2 (packages/functions/src/handlers/exports/httpFunctions.js:54) to the millisecond — P4, this identifies which limit fired. The request log carries no application log line because the container was killed mid-request, so the controller's catch never ran (and SEO's logger is bare console/severity DEFAULT anyway — P7). The endpoint is analysisController.getResourceReport (routes/api.js:220). Its only unbounded work is countResourcesWithFaq (analysisController.js:262 → generateBulkService.js:258): a serial `while (hasNext)` cursor walk (generateBulkService.js:266) over all four resource types at FAQ_SCAN_PAGE_SIZE = 250 (generateBulkService.js:182), with no page cap, no time budget, no early exit. Each page is an expensive GraphQL document — 250 nodes each carrying `faqMetafields: metafields(namespace:"faqs", first: 250)` plus images and two metafield lookups (graphql/query/products/productsPaginated.graphql:23). Cost scales linearly with catalog size, and the same endpoint on the same service returned 200 in 0.096s–49.4s across 20 other calls in the preceding 24h — 49.4s at 06:46:58Z shows the scan already runs tens of seconds on a mid-size shop. Because saveResourceReportCache is only reached after the whole scan completes (analysisController.js:289), a shop that cannot finish inside 540s never writes a cache entry, so every retry rescans from scratch: 23 requests between 15:21:45Z and 15:26:10Z, all 540s, none cached, none succeeding. The 200 at 15:21:26Z (0.187s) was a cache hit; the 504 burst starts 19s later alongside a fresh app-boot burst (/apiSa/shops, /apiSa/subscription, /apiSa/blockLoader, /apiSa/shopify/shop?fragment=productVendors), i.e. a different, larger shop with a cold cache — inferred, since request logs carry no shopId. This is not instance sickness: during the same 540s window the same instances served ~120 other /apiSa/* requests (settings, revert/history, shopify/productsBestSeller, history-optimize) in 0.02–2.4s, and the only non-request log entries are Cloud Run AUTOSCALING/startup-probe INFO lines — no OOM, no cold-start failure.

Confidence: `medium`

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:54` — apiSaGen2 declared timeoutSeconds: 540 — the exact limit the 23 requests hit (540.000s)
- `packages/functions/src/routes/api.js:220` — route registration mapping /resource-report to analysisController.getResourceReport
- `packages/functions/src/controllers/analysisController.js:262` — the request thread awaits the full catalog scan inline; only unbounded work in the handler
- `packages/functions/src/services/generateBulkService.js:266` — unbounded `while (hasNext)` serial cursor loop over all four tabs — no page cap, no deadline, no early exit
- `packages/functions/src/services/generateBulkService.js:182` — FAQ_SCAN_PAGE_SIZE = 250 — page size of the scan
- `packages/functions/src/graphql/query/products/productsPaginated.graphql:23` — each of the 250 nodes per page also pulls metafields(first: 250), making each page expensive
- `packages/functions/src/controllers/analysisController.js:289` — cache is written only after the entire scan finishes, so a timing-out shop never caches and every retry rescans
- `packages/functions/src/controllers/analysisController.js:249` — RESOURCE_REPORT_CACHE_TTL 10min cache-hit path — explains the 0.096–0.19s 200s and why only cold-cache calls 504

## Evidence
- 23 matching entries: `resource.labels.service_name="apisagen2" AND httpRequest.requestUrl:"/apiSa/resource-report" AND httpRequest.status=504 AND timestamp>="2026-08-01T00:00:00Z"`
- 20 matching entries: `resource.labels.service_name="apisagen2" AND httpRequest.requestUrl:"/apiSa/resource-report" AND httpRequest.status=200 AND timestamp>="2026-08-03T15:00:00Z" AND timestamp<="2026-08-04T16:00:00Z"`
- 120 matching entries: `resource.labels.service_name="apisagen2" AND httpRequest.status=200 AND timestamp>="2026-08-04T15:21:45Z" AND timestamp<="2026-08-04T15:24:15Z" AND logName="projects/avada-seo/logs/run.googleapis.com%2Frequests"`
- 8 matching entries: `resource.labels.service_name="apisagen2" AND timestamp>="2026-08-04T15:21:00Z" AND timestamp<="2026-08-04T15:35:00Z" AND NOT logName="projects/avada-seo/logs/run.googleapis.com%2Frequests"`

## Job
- analyze rounds: 1
- cost: $4.09
- tests: 809 tests, 5 failing · baseline 5 failing · reproduce check did not pass

```
.../functions/src/controllers/analysisController.js     | 10 +++++++---
 packages/functions/src/services/generateBulkService.js  | 17 +++++++++++++++--
 2 files changed, 22 insertions(+), 5 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
