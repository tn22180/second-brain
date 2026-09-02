fingerprint: z87lko
service: api
message: HTTP 504 GET /api/shopify/products
app: BLOG
repo: blogs
date: 2026-09-01T19:11:59.135Z
status: infra
attempt: 1

# BLOG · api · z87lko

**Outcome.** infra class — reported, no MR

**Root cause.** One api container (instance 00a41e8c1d37609ee7…6591570d, revision api-00163-mox) stopped completing its outbound calls at 2026-09-01T18:21:30Z while its Node process stayed responsive, so every request that got past the auth gate — including the alerted GET /api/shopify/products — blocked with no application-side deadline and was killed by Cloud Run at the function's own timeoutSeconds: 540.

**Mechanism.** Last successful response from that instance is 202 POST /api/track-event at 18:21:30.109700Z. From 18:22:39.108561Z to 18:49:41.876297Z it answered 30 requests and every one is a 504 with latency in 539.999764–540.001294s, i.e. the `timeoutSeconds: 540` declared for `api` at packages/functions/src/functions/http.js:30. The alerted GET /api/shopify/products (18:32:02.445489Z, 539.999935346s) is one of an 8-request burst admitted in 156 ms — one browser page load of /embed/blog. The process was NOT wedged: the same instance answered 6 requests 401 in 0.002921–0.004741s at 18:48:27–18:49:24 on the same paths (/api/articles, /api/articles/report/posts) that were simultaneously hanging for 540s, so Koa, the event loop and the middleware chain were all running. The 401 path returns inside the verifyEmbedRequest gate (packages/functions/src/handlers/api.js:86) before any outbound I/O; the 504 path is every request that passes that gate and makes its first outbound call. Redis is not the choke point on these routes: rateLimitConfig.default is null (packages/functions/src/config/rateLimit.js:8), so for /api/articles, /api/options, /api/settings, /api/shopify/*, /api/track-event the limiter returns at packages/functions/src/middleware/ratelimiter.js:61 without ever touching the ioredis client. The instance emitted zero application log lines for the whole 27 minutes (stderr in the window is 42 lines, all from sibling instances …1d1a04/…1d4a5d/…1de30c/…1d8cc4), which is what a hang before any catch block looks like. Cloud Run kept routing to it because a hung instance below its concurrency: 10 cap (http.js:32) still looks schedulable — the 18:32:02 burst of 8 plus 18:38:04's 2 exactly fills 10 slots, and the next admission only comes at 18:47:22 after the first batch expires. Meanwhile 4 sibling instances served 275 responses under HTTP 400 in the same window, so the service, Memorystore and Firestore were healthy fleet-wide; the fault is confined to this one container's egress.

Confidence: `medium` · infra class, not auto-fixed

## Code
- `packages/functions/src/functions/http.js:30` — timeoutSeconds: 540 for `api` — the exact value all 30 latencies match to the millisecond; this is what terminated the requests, and 9 minutes is the whole hang budget on a browser-facing API
- `packages/functions/src/functions/http.js:32` — concurrency: 10 — explains why the hung instance kept being handed new requests in batches of ≤10 and why the 18:32:02 page load lost 8 requests at once
- `packages/functions/src/handlers/api.js:86` — the verifyEmbedRequest gate; requests rejected here returned 401 in ~4 ms on the same instance at the same time, which is what proves the process was alive and puts the hang after this line
- `packages/functions/src/middleware/ratelimiter.js:61` — `if (!config) return next();` — with a null default config the limiter never issues a Redis command on any of the alerted routes, ruling ioredis out as the blocker
- `packages/functions/src/config/rateLimit.js:8` — `default: null` — none of /api/articles, /api/options, /api/settings, /api/shopify/*, /api/track-event match a routes entry, so all of them take the ratelimiter.js:61 early return

## Evidence
- 30 matching entries: `resource.labels.service_name="api" AND labels.instanceId="00a41e8c1d37609ee7bc52679280efd6ee61548bfc774510a9af0e8ebf3d89f624cccb2cbe1ab6f191a7f20493c769b3dac8e2e3ec329596e20d6bac5678420f5262e1eec443fd6591570d" AND timestamp>="2026-09-01T18:22:00Z" AND timestamp<="2026-09-01T18:56:05Z" AND httpRequest.status=504`
- 6 matching entries: `resource.labels.service_name="api" AND labels.instanceId="00a41e8c1d37609ee7bc52679280efd6ee61548bfc774510a9af0e8ebf3d89f624cccb2cbe1ab6f191a7f20493c769b3dac8e2e3ec329596e20d6bac5678420f5262e1eec443fd6591570d" AND timestamp>="2026-09-01T18:22:00Z" AND timestamp<="2026-09-01T18:56:05Z" AND httpRequest.status=401`
- 34 matching entries: `resource.labels.service_name="api" AND labels.instanceId="00a41e8c1d37609ee7bc52679280efd6ee61548bfc774510a9af0e8ebf3d89f624cccb2cbe1ab6f191a7f20493c769b3dac8e2e3ec329596e20d6bac5678420f5262e1eec443fd6591570d" AND timestamp>="2026-09-01T18:19:00Z" AND timestamp<="2026-09-01T18:22:00Z" AND httpRequest.status<400`
- 275 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-01T18:22:00Z" AND timestamp<="2026-09-01T18:56:05Z" AND httpRequest.status<400`
- 42 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-01T18:26:05.264Z" AND timestamp<="2026-09-01T18:56:05.264Z" AND logName:"stderr"`

## Job
- analyze rounds: 2
- cost: $3.60

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
