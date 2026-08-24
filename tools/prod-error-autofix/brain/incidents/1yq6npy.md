fingerprint: 1yq6npy
service: api
message: [redis.service] sustained connection outage no reconnect within 10000ms of ETIMEDOUT
app: BLOG
repo: blogs
date: 2026-08-22T06:31:20.936Z
status: fix_disabled
attempt: 1

# BLOG · api · 1yq6npy

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** packages/functions/src/services/redis.service.js escalates an in-progress, self-healing ioredis reconnect to severity=ERROR — its TRANSIENT_GRACE_MS of 10000ms is shorter than a single failed connect attempt cycle (connectTimeout 5000 + retryStrategy backoff, observed 5.6-6.2s spacing) — so a 56.4-second Memorystore blip on 2026-08-21T03:24:42.431Z-03:25:38.829Z (34.60.93.33:6380) produced 16 ERROR lines on api across 4 containers with zero failed HTTP requests (requests read = 0).

**Mechanism.** Four api containers (instanceIds 00a41e8c1d2fd8, 00a41e8c1dc21a, 00a41e8c1dd38e, 00a41e8c1d3f22) lost their sockets to Memorystore 34.60.93.33 and ioredis began retrying: 25 'connection error ETIMEDOUT connect ETIMEDOUT' warnings, then 2 'ECONNREFUSED connect ECONNREFUSED 34.60.93.33:6380' at 03:25:27.581/03:25:27.803 — the port actively refusing is a server-side Memorystore restart, not a client bug. Each retry costs connectTimeout 5000ms (line 24) plus retryStrategy backoff capped at 2000ms (line 27), so consecutive errors on one instance are 5.58-6.20s apart (03:24:42.431->03:24:48.014, 03:24:53.617->03:24:59.421). Two escalation paths then fire on that stream. (a) The wall-clock timer at line 49 fires TRANSIENT_GRACE_MS=10000 (line 31) after the FIRST error of a burst, i.e. while retry #2 is still in flight: 03:24:42.431445 -> 03:24:52.431912 is 10000.47ms, 03:24:42.608883 -> 03:24:52.613568 is 10004.69ms, 03:24:42.751252 -> 03:24:52.751035 is 9999.78ms — the configured constant to the millisecond, 7 such lines. (b) The counter path at line 58 fires on the 3rd error but calls clearTransientState() at line 59 — which zeroes transientErrorCount — BEFORE the template literal at line 63 reads it, so all 9 of its emissions print '0 consecutive ETIMEDOUT/ECONNREFUSED' when the true count was 3. ioredis reconnected on its own ('[redis.service] connected 34.60.93.33' at 03:25:29.599, 03:25:31.704, 03:25:38.829), 56.4s after the first error. Separately, maxRetriesPerRequest: 2 (line 22) defeats enableOfflineQueue: true (line 23): 7 commands buffered during the outage were rejected with 'Reached the max retries per request limit (which is 2)' rather than waiting for reconnect — 5 in withCache, 2 in getByField. None of those reached the merchant: withCache's catch at line 102 returns fetchFn() at line 103, falling through to Firestore, and getByField's catch at line 153 falls through the same way. That is why the requests read (httpRequest.status>=500) returned 0 entries for the whole 30-minute window while errors returned 23 redis-derived lines.

Confidence: `high`

## Code
- `packages/functions/src/services/redis.service.js:31` — TRANSIENT_GRACE_MS = 10000 — the grace window the seven 'no reconnect within 10000ms' escalations matched to the millisecond
- `packages/functions/src/services/redis.service.js:24` — connectTimeout: 5000 — one failed connect attempt alone burns half the grace, so the timer fires mid-retry
- `packages/functions/src/services/redis.service.js:27` — retryStrategy backoff capped at 2000ms; 5000+backoff explains the observed 5.58-6.20s spacing between ETIMEDOUT warnings
- `packages/functions/src/services/redis.service.js:49` — setTimeout escalation path that logs at logger.error while ioredis is still reconnecting — the alerted line
- `packages/functions/src/services/redis.service.js:59` — clearTransientState() zeroes transientErrorCount before line 63 interpolates it — why 9 lines read '0 consecutive' instead of 3
- `packages/functions/src/services/redis.service.js:63` — `${transientErrorCount} consecutive` reads the already-reset counter
- `packages/functions/src/services/redis.service.js:22` — maxRetriesPerRequest: 2 rejects offline-queued commands mid-outage — source of the 7 'Reached the max retries per request limit (which is 2)' ERRORs
- `packages/functions/src/services/redis.service.js:23` — enableOfflineQueue: true buffers commands, but line 22 caps the wait — the two options contradict each other
- `packages/functions/src/services/redis.service.js:74` — 'ready' handler clears transient state; it fired 3x during the window, proving the reconnect was self-healing
- `packages/functions/src/services/shopCache.service.js:102` — logs the redis get failure at logger.error even though the very next line recovers
- `packages/functions/src/services/shopCache.service.js:103` — return fetchFn() — Firestore fallback, why zero requests failed despite the ERROR lines
- `packages/functions/src/services/shopCache.service.js:153` — getByField's redis-get catch logs at logger.error then falls through to fetchFn at line 157 — same non-fatal pattern

## Evidence
- 16 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-21T03:09:55.154Z" AND timestamp<="2026-08-21T03:39:55.154Z" AND severity>=ERROR AND jsonPayload.tag="[redis.service]"`
- 25 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-21T03:09:55.154Z" AND timestamp<="2026-08-21T03:39:55.154Z" AND jsonPayload.message:"connection error ETIMEDOUT"`
- 7 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-21T03:09:55.154Z" AND timestamp<="2026-08-21T03:39:55.154Z" AND jsonPayload.message:"Reached the max retries per request limit"`
- 2 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-21T03:09:55.154Z" AND timestamp<="2026-08-21T03:39:55.154Z" AND jsonPayload.message:"ECONNREFUSED 34.60.93.33:6380"`
- 4 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-21T03:09:55.154Z" AND timestamp<="2026-08-21T03:39:55.154Z" AND jsonPayload.message:"[redis.service] connected"`
- 9 matching entries: `resource.labels.service_name="api" AND timestamp>="2026-08-21T03:09:55.154Z" AND timestamp<="2026-08-21T03:39:55.154Z" AND jsonPayload.message:"0 consecutive"`

## Job
- analyze rounds: 1
- cost: $1.47

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
