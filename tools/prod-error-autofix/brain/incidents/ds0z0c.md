fingerprint: ds0z0c
service: api
message: HTTP 504 PUT /api/article/29002956911
app: BLOG
repo: blogs
date: 2026-09-01T19:35:07.580Z
status: infra
attempt: 3

# BLOG · api · ds0z0c

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: one api container (instance 00a41e8c1d37609ee7bc…6591570d, revision api-00163-mox) lost the ability to complete outbound I/O at ~18:21:30Z on 2026-09-01 while its HTTP server stayed alive, so every request routed to it that touches Firestore/Redis/Shopify hung until Cloud Run cut it at the function's own timeoutSeconds: 540 — the alerted PUT /api/article/29002956911 is one of 50 such 504s, all on that single instance.

**Mechanism.** Cloud Run request logs for service api, 18:00–20:00Z: 50 of 50 504s carry labels.instanceId=00a41e8c1d3760… and revision api-00163-mox; six other instances (…1a04, …ac0f, …4a5d, …993b, …9442, …8cc4) served 448 2xx in the same window with zero 504. On the bad instance the last healthy completion is 2026-09-01T18:21:30.109700Z (202 POST /api/track-event, 0.396796248s); every request it accepted from 18:22:39Z through 19:22:45Z ended 504 with latency 540.000±0.01s, matching timeoutSeconds: 540 declared for `api` at packages/functions/src/functions/http.js:30 to the millisecond (P4). The process was not dead and the event loop was not wedged: the same instance still answered 8 requests 401 in 0.003–0.005s at 18:48:22–18:49:24Z and 19:20:55Z — the pre-I/O auth rejection in the @avada/core verifyEmbedRequest chain mounted at packages/functions/src/handlers/api.js:52 returns without touching the network, and it returned instantly. So only requests that await an outbound socket hung, across every unrelated dependency at once (/api/options, /api/settings → Firestore; /api/shopify/products, /api/shopify/pdf-files → Shopify Admin; /api/gen-ai-suggested/recommendBlogPost → OpenRouter). One container losing all egress explains that; no single application code path does. The alerted endpoint is collateral: PUT /api/article/29002956911 hung 4 times (18:47:40, 18:49:11, 19:02:41, 19:18:18) purely because the merchant's editor kept retrying against the same wedged instance. Code-side amplifier, not cause: the shared axios client is built with no timeout (packages/functions/src/helpers/api.js:9), so a doomed request holds one of the 10 concurrency slots for the full 540s instead of failing fast — that is why Cloud Run kept feeding the dead instance new traffic for 61 minutes.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/functions/http.js:30` — timeoutSeconds: 540 for the `api` function — the exact limit every one of the 50 failures hit (540.000s)
- `packages/functions/src/functions/http.js:32` — concurrency: 10 — the wedged instance held 10 in-flight slots, freeing one only every 540s, which is why it kept absorbing traffic for an hour
- `packages/functions/src/helpers/api.js:9` — axios.create() with no timeout: no outbound call has a deadline, so a broken egress path turns into a 540s hang instead of a fast error
- `packages/functions/src/handlers/api.js:52` — verifyEmbedRequest/shopifyCharge auth chain — the I/O-free path that still answered 401 in 0.003s, proving the process and event loop were alive while all network-bound requests hung
- `packages/functions/src/globalOptions.js:9` — all egress leaves through the VPC connector (PRIVATE_RANGES_ONLY); a per-container failure on that path takes down Firestore, Redis and Shopify calls simultaneously, which is the observed pattern

## Evidence
- 50 matching entries: `resource.labels.service_name="api" AND httpRequest.status=504 AND timestamp>="2026-09-01T18:00:00Z" AND timestamp<="2026-09-01T20:00:00Z"`
- 247 matching entries: `resource.labels.service_name="api" AND labels.instanceId="00a41e8c1d37609ee7bc52679280efd6ee61548bfc774510a9af0e8ebf3d89f624cccb2cbe1ab6f191a7f20493c769b3dac8e2e3ec329596e20d6bac5678420f5262e1eec443fd6591570d" AND timestamp>="2026-09-01T17:00:00Z" AND timestamp<="2026-09-01T21:00:00Z"`
- 8 matching entries: `resource.labels.service_name="api" AND httpRequest.status=401 AND labels.instanceId="00a41e8c1d37609ee7bc52679280efd6ee61548bfc774510a9af0e8ebf3d89f624cccb2cbe1ab6f191a7f20493c769b3dac8e2e3ec329596e20d6bac5678420f5262e1eec443fd6591570d" AND timestamp>="2026-09-01T18:22:00Z" AND timestamp<="2026-09-01T19:30:00Z"`
- 35 matching entries: `(resource.labels.service_name="api") AND timestamp>="2026-09-01T18:41:42.723Z" AND timestamp<="2026-09-01T19:11:42.723Z" AND logName:"stderr"`
- 4 matching entries: `resource.labels.service_name="api" AND httpRequest.requestUrl:"/api/article/29002956911" AND timestamp>="2026-09-01T18:00:00Z" AND timestamp<="2026-09-01T20:00:00Z"`

## Job
- analyze rounds: 1
- cost: $1.92

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
