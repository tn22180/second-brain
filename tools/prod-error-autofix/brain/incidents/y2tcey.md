fingerprint: y2tcey
service: proxy
message: [ShopCacheService.getByField] <http://maktaggweb.myshopify.com|maktaggweb.myshopify.com> redis set failed Reached the max retries per request limit (which is 2). Refer to "maxRetriesPerRequest" option for details.
app: BLOG
repo: blogs
date: 2026-08-22T06:43:49.595Z
status: fix_disabled
attempt: 1

# BLOG · proxy · y2tcey

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Duplicate of the recorded Memorystore-outage family (w7q35f / 1kwz9uf / e6i8uy): a 111-second Memorystore outage (34.60.93.33:6380, first ECONNREFUSED 2026-08-21T03:24:36.947Z → last reconnect 03:26:28.011Z) made every ioredis command on `proxy` fail after maxRetriesPerRequest:2, and ShopCacheService.getByField, withCache and rateLimiterMiddleware log that already-handled degraded-but-successful fallback at logger.error, so severity=ERROR reached the sink while no request failed.

**Mechanism.** redis.service.js:22 sets maxRetriesPerRequest:2, so during the outage each GET/SET/consume rejects with 'Reached the max retries per request limit (which is 2)'. The alerted line is shopCache.service.js:182 — the catch around the SET/SADD/EXPIRE block inside getByField — which logs at logger.error and then falls straight through to `return data` on line 184: the shop was already fetched from Firestore by fetchFn() at line 148, so the caller got its answer. The other 152 ERRORs in the window are the same shape: 24× the sibling get-failed catch at shopCache.service.js:153 (execution continues to fetchFn()), 47× withCache's get-failed catch at shopCache.service.js:102 which returns fetchFn() on the very next line, and 70× ratelimiter.js:73 which logs 'fallback allow' and then calls `await next()` at line 83, i.e. the request is deliberately let through. Proof nothing failed: the requests read (httpRequest.status>=500) returned 0 entries across the whole 30-minute window, and 5 '[redis.service] connected 34.60.93.33' lines land inside the window, the last at 03:26:28.011Z. Secondary defect in the same window: redis.service.js:59 calls clearTransientState() (which zeroes transientErrorCount) before the template literal at line 63 interpolates it, so all 5 escalation lines read literally 'sustained connection outage 0 consecutive ETIMEDOUT' — a count that can never print anything but 0. The Memorystore/VPC-connector outage itself is infra and not fixable in this repo; the fixable part is that a handled fallback is logged at error severity.

Confidence: `high`

## Code
- `packages/functions/src/services/shopCache.service.js:182` — the exact line in the alert — handled cache-write failure logged at logger.error, then `return data` on line 184; the shop was already resolved by fetchFn() at line 148
- `packages/functions/src/services/shopCache.service.js:153` — sibling get-failed catch, 24 of the 162 ERRORs in the window; execution falls through to fetchFn()
- `packages/functions/src/services/shopCache.service.js:102` — withCache get-failed catch, 47 ERRORs in the window, with `return fetchFn()` on the next line — the fallback is the designed path
- `packages/functions/src/middleware/ratelimiter.js:73` — largest contributor: 70 'fallback allow' ERRORs, followed by `await next()` at line 83 — the request is intentionally allowed through
- `packages/functions/src/services/redis.service.js:22` — maxRetriesPerRequest: 2 is the source of the 'which is 2' text carried in the alert message
- `packages/functions/src/services/redis.service.js:59` — clearTransientState() zeroes transientErrorCount before line 63 interpolates it, which is why all 5 escalation lines report '0 consecutive'

## Evidence
- 10 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-08-21T03:10:02.267Z" AND timestamp<="2026-08-21T03:40:02.267Z" AND jsonPayload.message:"redis set failed"`
- 70 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-08-21T03:10:02.267Z" AND timestamp<="2026-08-21T03:40:02.267Z" AND jsonPayload.message:"fallback allow"`
- 18 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-08-21T03:10:02.267Z" AND timestamp<="2026-08-21T03:40:02.267Z" AND jsonPayload.message:"[redis.service] connection error"`
- 5 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-08-21T03:10:02.267Z" AND timestamp<="2026-08-21T03:40:02.267Z" AND jsonPayload.message:"[redis.service] connected"`
- 5 matching entries: `(resource.labels.service_name="proxy" OR resource.labels.function_name="proxy") AND timestamp>="2026-08-21T03:10:02.267Z" AND timestamp<="2026-08-21T03:40:02.267Z" AND jsonPayload.message:"sustained connection outage 0 consecutive"`

## Job
- analyze rounds: 1
- cost: $1.39

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
