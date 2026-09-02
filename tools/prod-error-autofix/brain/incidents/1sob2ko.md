fingerprint: 1sob2ko
service: api
message: The request has been terminated because it has reached the maximum request timeout. To change this limit, see <https://cloud.google.com/run/docs/configuring/request-timeout>
app: BLOG
repo: blogs
date: 2026-09-01T18:58:22.573Z
status: infra
attempt: 2

# BLOG · api · 1sob2ko

**Outcome.** infra class — reported, no MR

**Root cause.** One api instance (00a41e8c1d37609ee7…6591570d, revision api-00163-mox) stopped serving at 2026-09-01T18:21:35Z and stayed unresponsive for ~25.5 minutes; Cloud Run kept routing to it, and every request it accepted in that span hung until the function's own `timeoutSeconds: 540` expired and Cloud Run answered 504 — 20 of 20 504s in the window are on that single instance, while 198 requests succeeded on three sibling instances at the same time.

**Mechanism.** Instance …3760 served normally all hour (402 log entries 17:50–18:50Z, request latencies 0.25–4.9s). Its last application stdout is 18:21:06.260Z ([fetchGhConfig] warn) and its last completed request finishes at 18:21:35.435Z (receiveTimestamp of the 18:21:09.145Z GET /api/get-list-ai-image, latency 26.077s). After that the process emits nothing and completes nothing for ~25.5 min. Cloud Run does not evict an instance for hanging requests, so it kept assigning it work in exactly three batches whose sizes are set by the declared concurrency: 10 requests arriving 18:22:39.108–18:22:58.610Z (= `concurrency: 10`, packages/functions/src/functions/http.js:32), then 8 arriving 18:32:02.324–18:32:02.480Z, then 2 at 18:38:04.99Z — each batch admitted only once the previous batch's slots freed, and slots free only at the 540s mark. All 20 carry latency 539.999–540.001s, matching `timeoutSeconds: 540` (packages/functions/src/functions/http.js:30) to the millisecond (pattern P4). Victims are trivially cheap routes (/api/options, /api/track-event, /api/settings, /api/blockLoader), so nothing about the individual request explains the hang — the process, not the handler, was stuck. The instance recovered on its own: at 18:48:27.537Z it answered GET /api/articles/report/posts in 4.7 ms. What blocked the process is NOT identifiable from the logs: no OOM ('Memory limit' matches nothing for api in 18:00–19:00Z), no container restart or STARTUP probe for …3760, no redis.service error (redis.service.js's `redis.on('error')` handler logs every ECONNRESET/ETIMEDOUT and logged none from this instance), and no application error line at all. The heavy-endpoint hypothesis is contradicted by count: /api/get-list-ai-image ran 21.2s at 17:56:41Z and 25.7s/16.0s/15.6s on other instances at 18:06/18:29/18:41Z with no wedge, so its 26.1s run at 18:21:09Z is within its normal range, not an outlier.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/functions/http.js:30` — `timeoutSeconds: 540` on the api function — the exact 539.999–540.001s latency of all 20 504s
- `packages/functions/src/functions/http.js:32` — `concurrency: 10` — first 504 batch is exactly 10 requests, so one wedged instance holds 10 slots for a full 540s before the next batch is admitted
- `packages/functions/src/functions/http.js:26` — the `api` onRequest declaration whose runtime config produces the blast radius; there is no health/watchdog signal that would evict a hung instance
- `packages/functions/src/services/redis.service.js:44` — the redis error handler that logs every transient socket code — it produced no line from this instance, which rules the Memorystore half-open theory out for this occurrence

## Evidence
- 20 matching entries: `resource.labels.service_name="api" AND httpRequest.status=504 AND timestamp>="2026-09-01T18:17:00Z" AND timestamp<="2026-09-01T18:47:00Z"`
- 198 matching entries: `resource.labels.service_name="api" AND httpRequest.status<400 AND timestamp>="2026-09-01T18:22:00Z" AND timestamp<="2026-09-01T18:47:00Z"`
- 402 matching entries: `resource.labels.service_name="api" AND labels.instanceId="00a41e8c1d37609ee7bc52679280efd6ee61548bfc774510a9af0e8ebf3d89f624cccb2cbe1ab6f191a7f20493c769b3dac8e2e3ec329596e20d6bac5678420f5262e1eec443fd6591570d" AND timestamp>="2026-09-01T17:50:00Z" AND timestamp<="2026-09-01T18:50:00Z"`
- 9 matching entries: `resource.labels.service_name="api" AND httpRequest.requestUrl:"get-list-ai-image" AND timestamp>="2026-09-01T17:50:00Z" AND timestamp<="2026-09-01T18:50:00Z"`
- 6 matching entries: `resource.labels.service_name="api" AND resource.labels.project_id="avada-blog-app" AND timestamp>="2026-09-01T18:00:00Z" AND timestamp<="2026-09-01T19:00:00Z" AND (logName:"varlog/system" OR textPayload:"Memory limit" OR textPayload:"terminated" OR textPayload:"Container")`

## Job
- analyze rounds: 2
- cost: $5.32

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
