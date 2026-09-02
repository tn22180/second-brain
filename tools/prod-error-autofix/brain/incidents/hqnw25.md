fingerprint: hqnw25
service: api
message: HTTP 504 GET /api/options
app: BLOG
repo: blogs
date: 2026-09-01T19:00:37.482Z
status: infra
attempt: 1

# BLOG · api · hqnw25

**Outcome.** infra class — reported, no MR

**Root cause.** Duplicate of recorded fingerprints 1sob2ko / 11ovwfj / 1904bct — same instance, same window, same 20 requests: api instance 00a41e8c1d3760…6591570d (revision api-00163-mox) stopped serving at 2026-09-01T18:21:35Z and stayed unresponsive ~25 min; Cloud Run kept routing to it and every request it accepted, including the alerted GET /api/options, hung until the function's own timeoutSeconds: 540 expired and Cloud Run answered 504.

**Mechanism.** The alerted GET /api/options 504 at 18:38:04.998256Z carries latency 540.000456569s and instanceId 00a41e8c1d3760 — matching timeoutSeconds: 540 (packages/functions/src/functions/http.js:30) to the millisecond, pattern P4, so the deadline that fired is the api function's own, not Hosting. All 20 of the 20 504s in the window are on that single instance while 198 requests returned <400 on three sibling instances (…cf47dafc 138, …6e33718d 58, …90ec5de72 2) in the same 18:22–18:47Z span, so neither Cloud Run, Memorystore nor Shopify was degraded fleet-wide. That instance's last application stdout is 18:21:06.260185Z ([fetchGhConfig] warn); every one of the 20 entries it produced after 18:21:36Z is a 504 request log and zero are application lines — the process accepted work and emitted nothing. Cloud Run does not evict an instance for hanging requests, so it admitted work in batches sized by concurrency: 10 (http.js:32): 10 arriving 18:22:39.108–18:22:58.610Z, 8 at 18:32:02.324–18:32:02.480Z, 2 at 18:38:04.99Z — each batch admitted only as the previous batch's slots freed at the 540s mark, which is why a trivially cheap route like GET /api/options is a victim. What blocked the event loop is not identifiable from the logs: no 'Memory limit' entry, no container restart/STARTUP probe for the instance, and no line from redis.service.js:44's redis.on('error') handler, which logs every ECONNRESET/EPIPE/ETIMEDOUT/ECONNREFUSED — that rules out the Memorystore half-open theory recorded in 1904bct for this occurrence. The code-level amplifier is real but unproven as the trigger: packages/functions/src/handlers/api.js:51 mounts rateLimiter() as the 2nd middleware on /api/*, so every request awaits a Redis roundtrip at ratelimiter.js:67 before touching a controller, and that limiter's storeClient (ratelimiter.js:46) has no commandTimeout anywhere in packages/functions/src — connectTimeout: 5000 (redis.service.js:24) bounds only the handshake and enableOfflineQueue: true (redis.service.js:23) queues rather than fails fast. That explains why a wedge produces silence, not why the wedge started.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/functions/http.js:30` — timeoutSeconds: 540 on the api function — the deadline all 20 504 latencies (539.999–540.001s) match to the millisecond, identifying which limit fired
- `packages/functions/src/functions/http.js:32` — concurrency: 10 — the first 504 batch is exactly 10 requests, so one wedged event loop holds every slot on the instance for a full 540s before the next batch is admitted
- `packages/functions/src/functions/http.js:26` — the api onRequest declaration whose runtime config sets the blast radius; there is no health signal that would evict a hung instance
- `packages/functions/src/services/redis.service.js:44` — redis.on('error') logs every transient socket code and produced no line from this instance, which rules the Memorystore half-open theory out for this occurrence
- `packages/functions/src/handlers/api.js:51` — api.use(rateLimiter()) is the 2nd middleware on /api/*, so GET /api/options and the other 19 victims awaited Redis before reaching any controller or logging anything
- `packages/functions/src/middleware/ratelimiter.js:67` — await limiter.consume(identifier) — the unbounded await; its catch only handles a thrown Error, and nothing is ever thrown when the promise simply never settles
- `packages/functions/src/middleware/ratelimiter.js:46` — storeClient: redis passed with no timeout and no insuranceLimiter, so the limiter inherits the client's absence of a command deadline
- `packages/functions/src/services/redis.service.js:24` — connectTimeout: 5000 is the only deadline configured — it bounds the TCP handshake, not commands on an already-open socket
- `packages/functions/src/services/redis.service.js:23` — enableOfflineQueue: true makes commands queue instead of failing fast once ioredis notices the socket is gone

## Evidence
- 20 matching entries: `resource.labels.service_name="api" AND httpRequest.status=504 AND timestamp>="2026-09-01T18:17:00Z" AND timestamp<="2026-09-01T18:47:00Z"`
- 20 matching entries: `resource.labels.service_name="api" AND labels.instanceId:"00a41e8c1d3760" AND timestamp>="2026-09-01T18:21:36Z" AND timestamp<="2026-09-01T18:47:00Z"`
- 198 matching entries: `resource.labels.service_name="api" AND httpRequest.status<400 AND timestamp>="2026-09-01T18:22:00Z" AND timestamp<="2026-09-01T18:47:00Z"`
- 37 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-01T18:17:01.358Z" AND timestamp<="2026-09-01T18:47:01.358Z" AND logName:"stderr"`

## Job
- analyze rounds: 1
- cost: $1.78

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
