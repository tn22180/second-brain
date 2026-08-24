fingerprint: j0knyy
service: api
message: [withCache] shop:id:Q9GWKCOs7QLiAdXRMTsd get failed Reached the max retries per request limit (which is 2). Refer to "maxRetriesPerRequest" option for details.
app: BLOG
repo: blogs
date: 2026-08-22T06:50:43.804Z
status: fix_disabled
attempt: 1

# BLOG · api · j0knyy

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Duplicate of recorded fingerprint e6i8uy: a ~56-second Memorystore outage (34.60.93.33:6380, 03:24:42.4Z first ETIMEDOUT → 03:25:38.8Z reconnect) made every ioredis command fail after maxRetriesPerRequest:2, and shopCache.service.js logs that already-handled cache-miss fallback at logger.error, so a degraded-but-successful request path emitted severity=ERROR and tripped the prod-error sink; no request failed.

**Mechanism.** packages/functions/src/services/redis.service.js:22 sets maxRetriesPerRequest: 2, so while the socket is down each GET/SET rejects with the exact alert text 'Reached the max retries per request limit (which is 2)'. That rejection is caught in withCache at packages/functions/src/services/shopCache.service.js:101-103: the catch logs at logger.error (line 102) and then returns fetchFn() on line 103 — the shop is still served from Firestore, the request succeeds. BLOG is the only app whose logger emits severity, so the sink matched the handled line and alerted. Same shape in getByField (line 153, falls through to fetchFn() at line 157) — the sibling alert e6i8uy. Proof the path is non-fatal: the requests read (httpRequest.status>=500) returned 0 entries over the whole 30-minute window, while 5 [withCache] ERROR lines fired at 03:25:05.567Z and 03:25:24.776-777Z across two shop ids (Q9GWKCOs7QLiAdXRMTsd ×2, Ek2Vc1WNepVP6HBXxLMx ×3), all on one instance/revision api-00143-qov, and '[redis.service] connected 34.60.93.33' logged at 03:25:29.6 / 03:25:31.7 / 03:25:38.8Z. Second, separate code defect visible in the same window: redis.service.js:59 calls clearTransientState() — which zeroes transientErrorCount — before the template literal at line 60-63 interpolates it, so the escalation line can only ever print '0 consecutive <code>'; 9 of the 26 ERROR entries literally read 'sustained connection outage 0 consecutive ETIMEDOUT/ECONNREFUSED'. The Memorystore/VPC-connector outage itself is infra and not fixable in this repo.

Confidence: `high`

## Code
- `packages/functions/src/services/shopCache.service.js:102` — the exact log line in the alert — handled cache-read failure logged at logger.error, then 'return fetchFn()' on the next line; all 5 [withCache] ERRORs in the window came from here
- `packages/functions/src/services/shopCache.service.js:153` — same defect in getByField (sibling alert e6i8uy) — logger.error, then falls through to fetchFn() at line 157
- `packages/functions/src/services/redis.service.js:22` — maxRetriesPerRequest: 2 is the source of the 'which is 2' message text carried in the alert
- `packages/functions/src/services/redis.service.js:59` — clearTransientState() zeroes transientErrorCount before line 60-63 interpolates it, which is why 9 escalation ERRORs report '0 consecutive'

## Evidence
- 5 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-21T03:10:07.188Z" AND timestamp<="2026-08-21T03:40:07.188Z" AND jsonPayload.message:"[withCache]" AND jsonPayload.message:"max retries per request limit"`
- 27 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-21T03:10:07.188Z" AND timestamp<="2026-08-21T03:40:07.188Z" AND jsonPayload.message:"[redis.service] connection error"`
- 4 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-21T03:10:07.188Z" AND timestamp<="2026-08-21T03:40:07.188Z" AND jsonPayload.message:"[redis.service] connected"`
- 9 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-21T03:10:07.188Z" AND timestamp<="2026-08-21T03:40:07.188Z" AND jsonPayload.message:"sustained connection outage 0 consecutive"`

## Job
- analyze rounds: 2
- cost: $1.90

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
