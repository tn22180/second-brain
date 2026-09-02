fingerprint: dp63np
service: api
message: HTTP 504 GET /api/blockLoader
app: BLOG
repo: blogs
date: 2026-09-01T19:27:16.573Z
status: infra
attempt: 1

# BLOG · api · dp63np

**Outcome.** infra class — reported, no MR

**Root cause.** One api instance (00a41e8c1d37609ee7…6591570d, revision api-00163-mox) lost its outbound dependency I/O at ~2026-09-01T18:21:2xZ and never recovered; from 18:22:39Z to 19:04:02Z every request that got past session verification on that instance hung until Cloud Run cut it at the function's own timeoutSeconds: 540, and GET /api/blockLoader was one of 40 such requests.

**Mechanism.** The instance served normally through 18:21:30.10Z (last 200, latency 0.457s) and wrote its last application log line at 18:21:06.26Z. After that it emitted zero log lines for the rest of the hour while still accepting traffic. Every request from 18:22:39.108Z onward returned 504 with latency 540.000xxx s — the api function is declared timeoutSeconds: 540 at packages/functions/src/functions/http.js:30, so the platform, not the app, ended each request. The process was not dead: the same instance answered 8 requests with HTTP 401 in 0.003–0.005s at 18:48:27Z and 19:20:55Z, so the Node event loop, Koa, and the pre-auth chain (createErrorHandler at handlers/api.js:50, rateLimiter at :51, verifyEmbedRequest at :63) all still ran at full speed deep inside the hang window. rateLimiter is a no-op for all of these paths — config/rateLimit.js:8 sets default: null and none of /api/blockLoader, /api/articles, /api/options, /api/settings, /api/track-event match a configured route, so middleware/ratelimiter.js:61 returns next() without touching Redis. That splits the request population cleanly: JWT-reject requests (no outbound I/O) finished in 4ms; every request whose session verified and therefore had to reach a backing store hung forever. The wedge is in outbound dependency I/O on that one container, and because no call on the authenticated path carries a deadline shorter than 540s, each one burned the whole function timeout instead of failing fast. Cloud Run kept routing to the instance for 42 minutes because the container stayed healthy. /api/blockLoader (routes/api.js:49) has no defect of its own — it appears in the 18:22:45Z and 18:32:02Z batches alongside 7 unrelated endpoints from the same admin page loads.

Confidence: `medium` · infra class, not auto-fixed

## Code
- `packages/functions/src/functions/http.js:30` — timeoutSeconds: 540 — the limit every hung request matched to 540.000xxx s, identifying which timeout fired
- `packages/functions/src/handlers/api.js:63` — verifyEmbedRequest is the session gate; its reject path is what still answered in 4ms while everything past it hung
- `packages/functions/src/middleware/ratelimiter.js:61` — returns next() without a Redis command when no route config matches, so Redis is not on the path of any of the 40 hung requests
- `packages/functions/src/config/rateLimit.js:8` — default: null — none of the alerted endpoints are rate-limited, which is what makes ratelimiter.js:61 the taken branch
- `packages/functions/src/routes/api.js:49` — the alerted GET /api/blockLoader route; ordinary handler, no defect, collateral of the instance-level stall

## Evidence
- 40 matching entries: `resource.labels.service_name="api" AND labels.instanceId:"00a41e8c1d37609ee7bc52679280efd6" AND timestamp>="2026-09-01T18:16:00Z" AND timestamp<="2026-09-01T19:30:00Z" AND logName:"run.googleapis.com%2Frequests"`
- 8 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-01T18:48:00Z" AND timestamp<="2026-09-01T19:25:00Z" AND httpRequest.status=401 AND logName:"run.googleapis.com%2Frequests"`
- 25 matching entries: `resource.labels.service_name="api" AND labels.instanceId:"00a41e8c1d37609ee7bc52679280efd6" AND timestamp>="2026-09-01T18:15:00Z" AND timestamp<="2026-09-01T19:35:00Z" AND NOT logName:"run.googleapis.com%2Frequests"`
- 20 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-09-01T18:26:05.292Z" AND timestamp<="2026-09-01T18:56:05.292Z" AND httpRequest.status>=500`
- 2 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-09-01T18:15:00Z" AND timestamp<="2026-09-01T18:30:00Z" AND jsonPayload.tag="[redis.service]"`

## Job
- analyze rounds: 1
- cost: $2.54

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
