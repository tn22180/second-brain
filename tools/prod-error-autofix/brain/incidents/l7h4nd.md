fingerprint: l7h4nd
service: apigen2
message: The request has been terminated because it has reached the maximum request timeout. To change this limit, see <https://cloud.google.com/run/docs/configuring/request-timeout>
app: SEO
repo: seo
date: 2026-08-13T03:50:54.954Z
status: inconclusive
attempt: 1

# SEO · apigen2 · l7h4nd

**Outcome.** smoke gate reproduce_not_failing

**Root cause.** GET /api/resource-report computes its answer inline by walking the shop's entire Shopify catalog (4 resource types, 250/page, no page cap, no deadline, no in-flight dedup), so for shop xtym3g-m5.myshopify.com the scan runs past apiGen2's configured timeoutSeconds: 540 and Cloud Run kills the request with a 504.

**Mechanism.** Same defect as fingerprint 100ms51 (2026-08-12, root cause high confidence, closed inconclusive only because the smoke gate did not reproduce). routes/api.js:220 binds GET /resource-report to getResourceReport. On a cache miss (analysisController.js:249, TTL 10 min) the controller builds a Shopify client with {autoLimit: true, maxRetries: 0} at analysisController.js:260 and awaits countResourcesWithFaq at analysisController.js:262. That function (generateBulkService.js:258) loops FAQ_GEN_TABS = ['product','collection','page','article'] (generateBulkService.js:175) and per tab runs an unbounded `while (hasNext)` cursor walk (generateBulkService.js:266) at FAQ_SCAN_PAGE_SIZE = 250 (generateBulkService.js:182), one serial Admin GraphQL round-trip per page (generateBulkService.js:338). No deadline, no page cap, no partial-result exit. Cloud Run request logs carry the request START time, so the three alerted entries began at 03:23:31, 03:24:31 and 03:24:36 and were killed at 03:32:31 / 03:33:31 / 03:33:36 — latencies 539.999s, 540.001s and 539.949s against apiGen2's timeoutSeconds: 540 (handlers/exports/httpFunctions.js:41), matched to the millisecond. Latency is a continuum against that cap, not a distinct failure mode: in the same 03:00–03:30Z burst, two requests for the same endpoint answered 200 at 243.63s and 251.76s while six answered 504 at ~540s. Every one of the six 504s carries ?section=meta-title and referer https://seo.apps.avada.io/embed/ai-content — the admin Report card, which calls the endpoint on mount at packages/assets/src/pages/AiContent/Report.js:29 — and the referers that retain their query string name shop=xtym3g-m5.myshopify.com (host b64 YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUveHR5bTNnLW01), so this is one shop, not a fleet-wide event. The failure is self-amplifying: saveResourceReportCache runs only after the whole scan finishes (analysisController.js:275), so a shop that cannot finish under 540s never populates its cache and re-scans from zero on every load, and nothing dedupes in-flight scans — the burst shows requests launched ~60s apart (03:08:40, 03:09:40, 03:09:42, 03:12:53, 03:13:53, 03:13:54, 03:13:56, 03:23:31, 03:24:31, 03:24:33) all scanning the same catalog concurrently on two instances (001548f729a7ec76b565, 001548f72946654a38ea). Those overlapping scans hit the shop's own Shopify rate bucket: stderr in the alert window carries 4× `[getResourceReport] T2H5gDwkGWqSC5T8GRS3 Throttled RequestError: Throttled` (03:24:44.264, 03:24:45.609, 03:24:46.390, 03:24:48.613) through shopify-api-node/got, and with maxRetries: 0 a single throttled page aborts a scan outright. The three alerted 504s themselves log nothing, which is expected — Cloud Run terminates the request before the catch at analysisController.js:292 can run. Not the cause: no OOM, no cold start, no container-startup failure in the window; the other stderr traffic (upsertTranslationSubcollection, updateAnalysis, PageSpeed on niid.hk) is unrelated concurrent work on the same instances.

Confidence: `high`

## Code
- `packages/functions/src/controllers/analysisController.js:262` — the request handler awaits the full catalog scan inline — the call that blows the 540s budget
- `packages/functions/src/controllers/analysisController.js:260` — Shopify client built with maxRetries: 0, so one Throttled page (4 logged this window) aborts a multi-minute scan
- `packages/functions/src/controllers/analysisController.js:249` — 10-min cache TTL — the only thing keeping small shops off the scan path
- `packages/functions/src/controllers/analysisController.js:275` — cache written only after the scan completes, so a shop that always exceeds 540s never populates it and re-scans on every load
- `packages/functions/src/services/generateBulkService.js:258` — countResourcesWithFaq — the unbounded scan itself
- `packages/functions/src/services/generateBulkService.js:266` — `while (hasNext)` cursor walk with no deadline, no page cap, no partial return
- `packages/functions/src/services/generateBulkService.js:175` — FAQ_GEN_TABS — the unbounded walk repeats serially for product, collection, page, article
- `packages/functions/src/services/generateBulkService.js:182` — FAQ_SCAN_PAGE_SIZE = 250 — sets the round-trip count for a large catalog
- `packages/functions/src/services/generateBulkService.js:338` — one serial shopify.graphql call per page — the latency that accumulates to 540s
- `packages/functions/src/handlers/exports/httpFunctions.js:41` — apiGen2 timeoutSeconds: 540 — the limit the 539.949–540.001s latencies match exactly
- `packages/functions/src/routes/api.js:220` — route registration binding GET /resource-report to getResourceReport
- `packages/assets/src/pages/AiContent/Report.js:29` — the admin Report card issues the call on mount — source of every referer on the six 504s

## Evidence
- 6 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-13T03:00:00Z" AND timestamp<="2026-08-13T03:30:00Z" AND httpRequest.requestUrl:"/api/resource-report" AND httpRequest.status=504`
- 2 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-13T03:00:00Z" AND timestamp<="2026-08-13T03:30:00Z" AND httpRequest.requestUrl:"/api/resource-report" AND httpRequest.status=200 AND httpRequest.latency>="200s"`
- 4 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-13T03:18:39.392Z" AND timestamp<="2026-08-13T03:48:39.392Z" AND logName:"stderr" AND textPayload:"[getResourceReport]"`
- 40 matching entries: `resource.labels.service_name="apigen2" AND timestamp>="2026-08-13T00:00:00Z" AND timestamp<="2026-08-13T04:00:00Z" AND httpRequest.requestUrl:"/api/resource-report"`
- 3 matching entries: `(resource.labels.service_name="apigen2" OR resource.labels.function_name="apigen2") AND timestamp>="2026-08-13T03:18:39.392Z" AND timestamp<="2026-08-13T03:48:39.392Z" AND httpRequest.status>=500`

## Job
- analyze rounds: 1
- cost: $3.65
- tests: 962 tests, 6 failing · baseline 6 failing · reproduce check did not pass

```
.../functions/src/controllers/analysisController.js    |  8 +++++---
 packages/functions/src/services/generateBulkService.js | 18 ++++++++++++++++--
 2 files changed, 21 insertions(+), 5 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
