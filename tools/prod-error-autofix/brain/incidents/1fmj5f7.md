fingerprint: 1fmj5f7
service: api
message: [redis.service] sustained connection outage 0 consecutive ECONNREFUSED with no reconnect
app: BLOG
repo: blogs
date: 2026-08-22T06:59:53.419Z
status: fix_disabled
attempt: 1

# BLOG · api · 1fmj5f7

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Duplicate of the recorded redis.service escalation family (1m4c9me / e6i8uy / 1yq6npy / 1l8e49w): no request failed — the alert is redis.service's own escalation branch firing during a self-healing ~56s Memorystore blip (34.60.93.33:6380), and it reads '0 consecutive ECONNREFUSED' because clearTransientState() zeroes transientErrorCount at packages/functions/src/services/redis.service.js:39 before the counter is interpolated at line 63; the ECONNREFUSED variant additionally fires on a single ECONNREFUSED because the counter is shared across all TRANSIENT_CODES.

**Mechanism.** ioredis emitted 27 'error' events between 03:24:42.4Z and 03:25:32.1Z — 25 ETIMEDOUT plus exactly 2 ECONNREFUSED (03:25:27.581448Z and 03:25:27.802979Z, both 'connect ECONNREFUSED 34.60.93.33:6380'). Every one enters the TRANSIENT_CODES branch (redis.service.js:44): logs a WARNING, does transientErrorCount += 1 (line 47), and once the count reaches TRANSIENT_ESCALATE_COUNT=3 (line 58) calls clearTransientState() (line 59) — which sets transientErrorCount = 0 (line 39) — and only afterwards builds the ERROR string `${transientErrorCount} consecutive ${e.code}` (line 63). So the number printed is structurally always 0: 6 of 6 such ERRORs in this window print '0' (4× ETIMEDOUT, 2× ECONNREFUSED), and none can print 3. The code named in the message is whichever error happened to be the 3rd, not a run of that code: the counter is not reset per-code, so each of the 2 lone ECONNREFUSED events tipped a count already carried by preceding ETIMEDOUTs, producing an escalation 44µs after its own warning (03:25:27.581448Z warn → 03:25:27.581492Z error). Meanwhile ioredis's own retryStrategy (line 27, times*200 capped 2000ms) reconnected unaided — 4 'connected 34.60.93.33' ready events at 03:25:29.6, 03:25:31.7, 03:25:38.8, 03:30:14.1Z — and the 7 commands that failed mid-blip with 'Reached the max retries per request limit (which is 2)' were absorbed by withCache, which returns fetchFn() on a get failure (shopCache.service.js:102-103) and swallows set failures (line 115). The requests read for this window returned 0 entries, so there is no merchant-facing failure behind this alert.

Confidence: `high`

## Code
- `packages/functions/src/services/redis.service.js:39` — clearTransientState() sets transientErrorCount = 0; it runs at line 59, before line 63 reads the counter — this is why the alert says '0 consecutive'
- `packages/functions/src/services/redis.service.js:63` — the interpolated `${transientErrorCount} consecutive ${e.code} with no reconnect` that produced the alert text verbatim
- `packages/functions/src/services/redis.service.js:47` — transientErrorCount += 1 is shared across all TRANSIENT_CODES, so a single ECONNREFUSED escalates on a count accumulated from ETIMEDOUTs — the code in the message is the last event, not a run
- `packages/functions/src/services/redis.service.js:27` — retryStrategy times*200 capped at 2000ms — ioredis reconnects on its own, which the 4 'connected' events show; the ERROR claims 'no reconnect'
- `packages/functions/src/services/redis.service.js:51` — the second escalation branch ('no reconnect within 10000ms of <code>'), 7 more ERRORs in the same window from the same blip
- `packages/functions/src/services/shopCache.service.js:102` — source of the 7 'Reached the max retries per request limit' ERRORs; line 103 returns fetchFn(), so the request still succeeds

## Evidence
- 2 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-21T03:10:29.174Z" AND timestamp<="2026-08-21T03:40:29.174Z" AND jsonPayload.message:"sustained connection outage 0 consecutive ECONNREFUSED"`
- 27 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-21T03:10:29.174Z" AND timestamp<="2026-08-21T03:40:29.174Z" AND jsonPayload.message:"[redis.service] connection error"`
- 4 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-21T03:10:29.174Z" AND timestamp<="2026-08-21T03:40:29.174Z" AND jsonPayload.message:"[redis.service] connected"`
- 7 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-21T03:10:29.174Z" AND timestamp<="2026-08-21T03:40:29.174Z" AND jsonPayload.message:"Reached the max retries per request limit"`

## Job
- analyze rounds: 2
- cost: $1.90

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
