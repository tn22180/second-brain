fingerprint: 1hwr0fe
service: api
message: HTTP 504 GET /api/shopify/pdf-files
app: BLOG
repo: blogs
date: 2026-09-01T19:03:54.385Z
status: infra
attempt: 1

# BLOG · api · 1hwr0fe

**Outcome.** infra class — reported, no MR

**Root cause.** Duplicate of recorded fingerprints 1sob2ko / 11ovwfj / 1904bct / hqnw25 / 5nlg6v — one api instance (00a41e8c1d37609ee7…6591570d, revision api-00163-mox) stopped serving at 2026-09-01T18:21:35Z and stayed wedged ~25.5 minutes; Cloud Run kept routing to it, so every request it accepted hung until the function's own timeoutSeconds: 540 expired and Cloud Run answered 504, including the alerted GET /api/shopify/pdf-files.

**Mechanism.** All 20 of the 20 5xx entries in the window are 504s on the single instance 00a41e8c1d37609ee7bc…, revision api-00163-mox, with latency 539.999853–540.001294s — matching timeoutSeconds: 540 (packages/functions/src/functions/http.js:30) to the millisecond (pattern P4). The alerted request GET /api/shopify/pdf-files?limit=50&sort=CREATED_… appears twice, at 18:22:45.197095Z (540.000430104s) and 18:32:02.444493Z (540.001241986s), both on that instance. That instance's last application log line is 18:21:06.260185Z ([fetchGhConfig] GH config fetch failed — failing open) and it emits nothing for the rest of the window, while three sibling instances (…1a04, …4a5d, …8cc4) keep logging normally through 18:46Z — so the process, not the handler, was stuck: the victim routes are trivially cheap (/api/options, /api/track-event, /api/settings, /api/blockLoader) and nothing about them explains a 9-minute hang. The 504s arrive in three batches — 10 requests 18:22:39.108–18:22:58.610Z, 8 at 18:32:02.324–18:32:02.480Z, 2 at 18:38:04.99Z — the first batch size being exactly concurrency: 10 (packages/functions/src/functions/http.js:32), and each later batch admitted only when the previous batch's slots free at the 540s mark. Cloud Run never evicts an instance for hanging requests and there is no readiness/watchdog signal on the onRequest declaration (packages/functions/src/functions/http.js:26), so one wedged process holds 10 slots per 540s window. What blocked the process is not identifiable from the logs: no OOM line, no container restart or STARTUP probe for that instance, and no redis.service error handler output (packages/functions/src/services/redis.service.js:44) from it.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/functions/http.js:30` — timeoutSeconds: 540 on the api function — the exact 539.999853–540.001294s latency of all 20 504s, including both alerted /api/shopify/pdf-files requests
- `packages/functions/src/functions/http.js:32` — concurrency: 10 — the first 504 batch is exactly 10 requests, so one wedged instance holds 10 slots for a full 540s before the next batch is admitted
- `packages/functions/src/functions/http.js:26` — the api onRequest declaration carrying that runtime config; there is no health/watchdog signal that would let Cloud Run evict a hung instance
- `packages/functions/src/services/redis.service.js:44` — the redis error handler that logs every transient socket code — it produced no line from the wedged instance, ruling out the Memorystore half-open theory for this occurrence

## Evidence
- 20 matching entries: `resource.labels.service_name="api" AND httpRequest.status=504 AND timestamp>="2026-09-01T18:17:00Z" AND timestamp<="2026-09-01T18:47:00Z"`
- 2 matching entries: `resource.labels.service_name="api" AND httpRequest.requestUrl:"pdf-files" AND timestamp>="2026-09-01T18:17:00Z" AND timestamp<="2026-09-01T18:47:00Z"`
- 198 matching entries: `resource.labels.service_name="api" AND httpRequest.status<400 AND timestamp>="2026-09-01T18:22:00Z" AND timestamp<="2026-09-01T18:47:00Z"`
- 402 matching entries: `resource.labels.service_name="api" AND labels.instanceId="00a41e8c1d37609ee7bc52679280efd6ee61548bfc774510a9af0e8ebf3d89f624cccb2cbe1ab6f191a7f20493c769b3dac8e2e3ec329596e20d6bac5678420f5262e1eec443fd6591570d" AND timestamp>="2026-09-01T17:50:00Z" AND timestamp<="2026-09-01T18:50:00Z"`
- 6 matching entries: `resource.labels.service_name="api" AND resource.labels.project_id="avada-blog-app" AND timestamp>="2026-09-01T18:00:00Z" AND timestamp<="2026-09-01T19:00:00Z" AND (logName:"varlog/system" OR textPayload:"Memory limit" OR textPayload:"terminated" OR textPayload:"Container")`

## Job
- analyze rounds: 1
- cost: $1.37

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
