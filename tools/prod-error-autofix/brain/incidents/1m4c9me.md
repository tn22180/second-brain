fingerprint: 1m4c9me
service: api
message: [redis.service] sustained connection outage 0 consecutive ETIMEDOUT with no reconnect
app: BLOG
repo: blogs
date: 2026-08-22T06:35:12.384Z
status: fix_disabled
attempt: 1

# BLOG · api · 1m4c9me

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** No request failed: the alert is redis.service's own escalation branch firing during a 56-second self-healing Memorystore connectivity blip (34.60.93.33:6380, 03:24:42.4Z→03:25:38.8Z), and its message reads '0 consecutive' because clearTransientState() zeroes transientErrorCount at packages/functions/src/services/redis.service.js:59 before the counter is interpolated into the template literal at line 63.

**Mechanism.** ioredis emitted 21 ETIMEDOUT + 2 ECONNREFUSED 'error' events between 03:24:42.4Z and 03:25:32.1Z. Each hits the TRANSIENT_CODES branch (redis.service.js:45): it logs a WARNING, increments transientErrorCount, and on the 3rd event calls clearTransientState() (line 59) — which sets transientErrorCount = 0 — and only then builds the ERROR string `${transientErrorCount} consecutive ${e.code}` (line 63), so the escalation always prints 0. 9 of 9 such ERRORs in the window print '0'; none can ever print 3. Meanwhile ioredis's own retryStrategy (line 27) reconnected without intervention — 4 'connected 34.60.93.33' ready events at 03:25:29.6, 03:25:31.7, 03:25:38.8, 03:30:14.1 — and the 7 commands that failed mid-outage with 'Reached the max retries per request limit (which is 2)' were caught by withCache, which returns fetchFn() on a get failure (shopCache.service.js:101-103) and swallows set failures (line 114-116). requests read returned 0 entries at httpRequest.status>=500: no merchant-facing failure exists behind this alert.

Confidence: `high`

## Code
- `packages/functions/src/services/redis.service.js:59` — clearTransientState() resets transientErrorCount to 0 before line 63 reads it, so the escalation message always says '0 consecutive'
- `packages/functions/src/services/redis.service.js:63` — the interpolated `${transientErrorCount} consecutive ${e.code}` that produced the alert text verbatim
- `packages/functions/src/services/redis.service.js:27` — retryStrategy times*200 capped at 2000ms — ioredis reconnects on its own, which is what the 4 'connected' events show
- `packages/functions/src/services/redis.service.js:51` — the second escalation path ('no reconnect within 10000ms of ETIMEDOUT'), 7 more ERRORs in the same window from the same blip
- `packages/functions/src/services/shopCache.service.js:102` — the 7 'Reached the max retries per request limit' ERRORs come from here; line 103 returns fetchFn(), so the request still succeeds

## Evidence
- 9 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-21T03:09:55.606Z" AND timestamp<="2026-08-21T03:39:55.606Z" AND jsonPayload.message:"sustained connection outage 0 consecutive"`
- 4 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-21T03:09:55.606Z" AND timestamp<="2026-08-21T03:39:55.606Z" AND jsonPayload.message:"[redis.service] connected"`
- 7 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-21T03:09:55.606Z" AND timestamp<="2026-08-21T03:39:55.606Z" AND jsonPayload.message:"Reached the max retries per request limit"`
- 39 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api" OR resource.labels.job_name="api") AND timestamp>="2026-08-21T03:09:55.606Z" AND timestamp<="2026-08-21T03:39:55.606Z" AND jsonPayload.tag="[redis.service]"`

## Job
- analyze rounds: 2
- cost: $2.10

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
