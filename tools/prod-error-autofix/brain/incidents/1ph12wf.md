fingerprint: 1ph12wf
service: api
message: [fetchAllImagesFromShopify] PnKC4q13qtMCeY1BDfEz Error fetching images RequestError: Throttled
app: BLOG
repo: blogs
date: 2026-07-30T11:24:50.873Z
status: inconclusive
attempt: 1

# BLOG · api · 1ph12wf

**Outcome.** MR not opened: push_failed

**Root cause.** GET /api/get-list-ai-image ignores its own page/limit params and re-downloads the shop's entire Shopify file library on every request: getListImageAiGraphql calls fetchAllImagesFromShopify, which loops files(first: 250) until hasNextPage is false, accumulating every edge in memory — on big-library shop PnKC4q13qtMCeY1BDfEz that both trips Shopify's GraphQL cost limit (RequestError: Throttled) and exhausts the V8 heap.

**Mechanism.** One instance, 001548f7299e, carries the whole chain. Four GET /api/get-list-ai-image?limit=10&page=1 requests start 10:38:57.940, 10:39:00.019, 10:40:58.038, 10:41:06.923 and each ends at 539.9665-539.9680s = the api function's own timeoutSeconds: 540 (functions/http.js:29), one of them logging 'The request has been terminated because it has reached the maximum request timeout'. Two of them log [fetchAllImagesFromShopify] ... RequestError: Throttled at 10:40:57.794 and 10:40:59.537 — 119.85s and 119.52s into requests 1 and 2 respectively, i.e. after ~24-30 sequential pages of files(first: 250) with nested metafield/preview/originalSource selections drain Shopify's 1000-point leaky bucket. The catch at imageGeneration.service.js:119-122 only logs and breaks, so the request neither retries nor fails: it returns a silently truncated list and keeps burning the remaining ~420s in GC thrash over the accumulated arrays — the stderr GC log shows Mark-Compact 1614.1 (1652.9) -> 1600.7 MB taking 1602.33ms and 1718.48ms, i.e. 'Ineffective mark-compacts near heap limit'. At 10:50:14.533 the same instance hits FATAL ERROR: JavaScript heap out of memory, then Uncaught signal: 6 (SIGABRT) at 10:50:14.547 — 7.6s after PUT /api/article/598420259037 arrived at 10:50:06.930 on that same instance, which is why that unrelated request answered 503 'malformed response ... connection to the instance had an error' with latency 7.694s. concurrency: 10 (functions/http.js:31) is what turns one merchant's list request into a shared-instance kill. This is heap exhaustion inside Node, not the container's 2GiB memory limit, so it is an application bug, not the P3 infra pattern.

Confidence: `high`

## Code
- `packages/functions/src/services/imageGeneration.service.js:160` — getListImageAiGraphql calls fetchAllImagesFromShopify(shop) unconditionally on every request, before page/limit are ever considered
- `packages/functions/src/services/imageGeneration.service.js:111` — while (hasNextPage) — unbounded sequential pagination, no page cap, no cost-aware delay
- `packages/functions/src/services/imageGeneration.service.js:75` — files(first: 250) with nested metafield + preview.image + originalSource; high GraphQL cost per page is what produces Throttled
- `packages/functions/src/services/imageGeneration.service.js:116` — allImages = allImages.concat(files.edges) — unbounded in-memory accumulation of raw edges, the heap-OOM source
- `packages/functions/src/services/imageGeneration.service.js:120` — the exact log line in the alert; the catch only logs and breaks, so a throttle returns a silently truncated list instead of an error
- `packages/functions/src/services/imageGeneration.service.js:211` — filteredImages.slice(startIndex, endIndex) — pagination applied client-side after the whole library is fetched and sorted
- `packages/functions/src/functions/http.js:29` — timeoutSeconds: 540 on api, matching the observed 539.9665s 504 latency
- `packages/functions/src/functions/http.js:31` — concurrency: 10 — one heap kill takes down up to 9 unrelated in-flight requests, e.g. the 10:50:06 PUT /api/article 503
- `packages/functions/src/routes/api.js:260` — route registration tying GET /api/get-list-ai-image to genImageAIController.get

## Evidence
- 4 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-30T10:38:46.443Z" AND timestamp<="2026-07-30T11:08:46.443Z" AND "fetchAllImagesFromShopify"`
- 4 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-30T10:38:46.443Z" AND timestamp<="2026-07-30T11:08:46.443Z" AND httpRequest.status=504`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-30T10:38:46.443Z" AND timestamp<="2026-07-30T11:08:46.443Z" AND "JavaScript heap out of memory"`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-30T10:38:46.443Z" AND timestamp<="2026-07-30T11:08:46.443Z" AND "Uncaught signal: 6"`
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-30T10:38:46.443Z" AND timestamp<="2026-07-30T11:08:46.443Z" AND "maximum request timeout"`

## Job
- analyze rounds: 1
- cost: $2.49
- fix commit: `7e02a1e3b08827f4c7e1b5b6d85a69ef3557b430`
- tests: 195 tests, 3 failing · baseline 3 failing · reproduce test fails without the fix

```
packages/functions/src/services/imageGeneration.service.js | 9 ++++++++-
 1 file changed, 8 insertions(+), 1 deletion(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
