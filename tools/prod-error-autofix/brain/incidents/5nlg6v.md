fingerprint: 5nlg6v
service: api
message: HTTP 504 POST /api/shop
app: BLOG
repo: blogs
date: 2026-09-01T19:02:28.076Z
status: infra
attempt: 1

# BLOG · api · 5nlg6v

**Outcome.** infra class — reported, no MR

**Root cause.** Duplicate of recorded fingerprints 1sob2ko / hqnw25 / 11ovwfj / 1904bct — one api instance (00a41e8c1d3760, revision api-00163-mox) stopped serving at 2026-09-01T18:21:35Z and stayed wedged ~25 min; Cloud Run kept routing to it and every request it accepted, including the alerted POST /api/shop, hung until the function's own timeoutSeconds: 540 expired and Cloud Run answered 504.

**Mechanism.** The alerted POST /api/shop 504 is the request log at 2026-09-01T18:22:58.610379Z with latency 540.000855425s on instanceId 00a41e8c1d3760, revision api-00163-mox — matching `timeoutSeconds: 540` (packages/functions/src/functions/http.js:30) to the millisecond, pattern P4, so the deadline that fired is the api function's own, not Hosting. All 20 of the 20 504s in the 18:17–18:47Z window carry latency 539.999–540.001s and all 20 are on that one instance, while its three sibling instances (…1a04, …4a5d, …8cc4) kept logging normally through the same span (37 stderr lines, none from …3760 after 18:21:06.260185Z) — so neither Cloud Run, Memorystore nor Shopify was degraded fleet-wide. The instance's last application stdout of any kind is 18:21:06.260185Z ([fetchGhConfig] warn); every entry it produced afterwards is a 504 request log and zero are application lines, i.e. the process accepted work and emitted nothing. Cloud Run does not evict an instance for hanging requests, so it admitted work in batches sized by `concurrency: 10` (http.js:32): 10 arriving 18:22:39.108–18:22:58.610Z (the alerted POST /api/shop is the 10th and last of that batch, i.e. the slot that filled the instance), 8 at 18:32:02.324–18:32:02.480Z, 2 at 18:38:04.99Z — each batch admitted only as the previous batch's slots freed at the 540s mark. Victims are trivially cheap routes (/api/options, /api/track-event, /api/settings, /api/blockLoader), so no individual handler explains the hang: the event loop, not the controller, was stuck. What blocked it is not identifiable from these logs — no OOM line, no container restart/STARTUP probe for …3760, and no line from redis.service.js:44's redis.on('error') handler. The code-level amplifier that turns any single stall into a whole-instance outage is real and cited: packages/functions/src/handlers/api.js:51 mounts rateLimiter() as the 2nd middleware on /api/*, so every request awaits a Redis roundtrip at packages/functions/src/middleware/ratelimiter.js:67 before reaching any controller, and that limiter's storeClient (ratelimiter.js:46) is the ioredis client built with enableOfflineQueue: true (redis.service.js:23) and connectTimeout: 5000 (redis.service.js:24) — which bounds only the TCP handshake — with no commandTimeout anywhere in packages/functions/src and no insuranceLimiter, so a command that never settles hangs the request forever.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/functions/http.js:30` — timeoutSeconds: 540 — the limit the 20 504 latencies (540.000±0.001s) match to the millisecond
- `packages/functions/src/functions/http.js:32` — concurrency: 10 — sets the batch size Cloud Run admitted to the wedged instance (10, then 8, then 2)
- `packages/functions/src/handlers/api.js:51` — rateLimiter() mounted as 2nd middleware on /api/*, ahead of every controller, so POST /api/shop awaits Redis before any handler code
- `packages/functions/src/middleware/ratelimiter.js:67` — await limiter.consume(identifier) — the unbounded await every /api/* request passes
- `packages/functions/src/middleware/ratelimiter.js:46` — storeClient: redis with no insuranceLimiter — no fallback when the store stops answering
- `packages/functions/src/services/redis.service.js:23` — enableOfflineQueue: true — commands queue instead of failing fast
- `packages/functions/src/services/redis.service.js:24` — connectTimeout: 5000 bounds only the TCP handshake; no commandTimeout exists in packages/functions/src

## Evidence
- 20 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-01T18:17:01.407Z" AND timestamp<="2026-09-01T18:47:01.407Z" AND httpRequest.status>=500`
- 37 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-01T18:17:01.407Z" AND timestamp<="2026-09-01T18:47:01.407Z" AND logName:"stderr"`
- 20 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-01T18:17:01.407Z" AND timestamp<="2026-09-01T18:47:01.407Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.41

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
