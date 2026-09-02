fingerprint: 11ovwfj
service: api
message: HTTP 504 GET /api/articles/report/posts
app: BLOG
repo: blogs
date: 2026-09-01T18:46:51.246Z
status: fix_disabled
attempt: 1

# BLOG · api · 11ovwfj

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** One api instance (00a41e8c1d3760…6591570d, revision api-00163-mox) wedged its event loop at ~18:21:30Z on the unbounded `await limiter.consume()` in the rateLimiter middleware — the ioredis client has no commandTimeout and enableOfflineQueue:true, so a command on an established-but-dead Memorystore socket never settles — and every one of the 18 requests Cloud Run subsequently routed to that instance, including the alerted GET /api/articles/report/posts, hung until the configured 540s timeout and returned 504. Same instance and same stall already recorded as fingerprint 1904bct (status fix_disabled); this alert is a second symptom endpoint of that one cause, and the window shows the stall consumed 18 requests, not the 10 recorded there.

**Mechanism.** packages/functions/src/handlers/api.js:51 mounts rateLimiter() as the 2nd middleware on /api/*, ahead of every controller, so no /api/* request reaches application code without first awaiting a Redis roundtrip at packages/functions/src/middleware/ratelimiter.js:67. That call's RateLimiterRedis is given storeClient: redis (ratelimiter.js:46) with no timeout and no insuranceLimiter, and that client (packages/functions/src/services/redis.service.js) sets connectTimeout: 5000 (line 24) — which bounds only the TCP handshake — and enableOfflineQueue: true (line 23), with no commandTimeout anywhere in packages/functions/src. A socket that stops delivering without FIN/RST therefore leaves the command promise pending forever; ioredis emits no 'error' event, which is why instance …6591570d logged nothing at all after 18:21:31Z. Confirmed: `instanceId:"00a41e8c1d3760"` matches exactly 18 entries in 18:21:31Z→19:30:00Z and every one of them is a 504 request log — zero application lines. All 18 latencies are 540.000±0.001s, matching timeoutSeconds: 540 (packages/functions/src/functions/http.js:30) to the millisecond (P4). The first batch is exactly 10 requests (18:22:39.108–18:22:58.610Z), equal to the declared concurrency: 10 (http.js:32) — one wedged event loop takes every slot; the remaining 8 queued behind them and timed out from their own arrival at 18:32:02Z. Not a Memorystore-side outage: during the same 18:22:39–18:32:02Z span instances …cf47dafc and …6e33718d served 83 HTTP 200s through the identical rateLimiter, so Redis was reachable fleet-wide. Not OOM/CPU either — no 'Memory limit exceeded' and no varlog entry for the instance in the window.

Confidence: `medium`

## Code
- `packages/functions/src/handlers/api.js:51` — api.use(rateLimiter()) is the 2nd middleware, so all 18 wedged requests across 11 distinct endpoints awaited Redis before reaching any controller or logging anything
- `packages/functions/src/middleware/ratelimiter.js:67` — `await limiter.consume(identifier)` — the unbounded await that never settled; the catch below only handles a thrown Error and nothing was ever thrown
- `packages/functions/src/middleware/ratelimiter.js:46` — storeClient: redis passed with no timeout and no insuranceLimiter, so the limiter inherits the client's absence of a command deadline
- `packages/functions/src/services/redis.service.js:24` — connectTimeout: 5000 is the only deadline configured — it bounds the handshake, not commands on an already-open socket
- `packages/functions/src/services/redis.service.js:23` — enableOfflineQueue: true makes commands queue instead of failing fast once ioredis does notice the socket is gone
- `packages/functions/src/functions/http.js:30` — timeoutSeconds: 540 — the limit all 18 latencies match to the millisecond, identifying which deadline fired
- `packages/functions/src/functions/http.js:32` — concurrency: 10 explains the first batch being exactly 10 requests — one wedged event loop consumes every slot on the instance

## Evidence
- 18 matching entries: `resource.labels.service_name="api" AND httpRequest.status>=500 AND httpRequest.latency>="539s" AND timestamp>="2026-09-01T18:17:01Z" AND timestamp<="2026-09-01T18:47:01Z"`
- 18 matching entries: `resource.labels.service_name="api" AND labels.instanceId:"00a41e8c1d3760" AND timestamp>="2026-09-01T18:21:31Z" AND timestamp<="2026-09-01T19:30:00Z"`
- 83 matching entries: `resource.labels.service_name="api" AND httpRequest.status=200 AND timestamp>="2026-09-01T18:22:39Z" AND timestamp<="2026-09-01T18:32:02Z"`
- 2 matching entries: `resource.labels.service_name="api" AND jsonPayload.tag="[redis.service]" AND timestamp>="2026-09-01T18:17:01Z" AND timestamp<="2026-09-01T18:47:01Z"`

## Job
- analyze rounds: 1
- cost: $1.62

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
