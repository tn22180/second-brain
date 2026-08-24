fingerprint: tx75fq
service: auth
message: [redis.service] sustained connection outage 0 consecutive ETIMEDOUT with no reconnect
app: BLOG
repo: blogs
date: 2026-08-22T06:36:52.511Z
status: fix_disabled
attempt: 1

# BLOG · auth · tx75fq

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** No request failed: the alert is redis.service's own escalation branch firing during a self-healing 56-second Memorystore (34.60.93.33) connectivity blip on 2026-08-21T03:24:42Z→03:25:46Z, and its text reads '0 consecutive' because clearTransientState() zeroes transientErrorCount at packages/functions/src/services/redis.service.js:59 before the counter is interpolated into the template literal at line 63.

**Mechanism.** ioredis emitted 6 ETIMEDOUT 'error' events on the auth service at 03:24:42.471, 03:24:48.323, 03:24:54.215, 03:25:00.027, 03:25:06.325, 03:25:12.527 (plus 03:25:18.931, 03:25:25.627). Each enters the TRANSIENT_CODES branch (redis.service.js:45): logs a WARNING, increments transientErrorCount (line 47), arms a 10s escalation timer if none is armed (lines 48-57). On the 3rd event the code calls clearTransientState() (line 59) — which sets transientErrorCount = 0 (line 39) — and only THEN builds `${transientErrorCount} consecutive ${e.code}` (line 63), so the escalation always prints 0 and can never print 3. Both such ERRORs in this window (03:24:54.215, 03:25:12.528) print '0'. The other 3 ERRORs are the grace-timer branch (line 51-55) firing exactly TRANSIENT_GRACE_MS after each cycle's first error — 03:24:42.471+10s=03:24:52.472, 03:25:00.027+10s=03:25:10.027, 03:25:18.931+10s=03:25:28.933 — claiming 'no reconnect' while ioredis's own retryStrategy (line 27) was still retrying. It reconnected without intervention: '[redis.service] connected 34.60.93.33' at 03:25:46.723, whose 'ready' handler (line 74-77) clears the state. The requests read (httpRequest.status>=500) returned 0 entries for auth in the 30-minute window: no merchant-facing failure exists behind this alert. Same blip lit 39 ERRORs across 5 services in 03:20-03:32Z (api 16, proxy 10, auth 5, embedapp 4, handleproderroralert 4) — one cause, fleet-wide symptom.

Confidence: `high`

## Code
- `packages/functions/src/services/redis.service.js:59` — clearTransientState() resets transientErrorCount to 0 before line 63 reads it, so the escalation message always says '0 consecutive'
- `packages/functions/src/services/redis.service.js:63` — the interpolated `${transientErrorCount} consecutive ${e.code} with no reconnect` that produced the alert text verbatim
- `packages/functions/src/services/redis.service.js:39` — transientErrorCount = 0 inside clearTransientState — the assignment that empties the counter
- `packages/functions/src/services/redis.service.js:51` — the second escalation path ('no reconnect within 10000ms of ETIMEDOUT'), 3 of the 5 ERRORs in this window, fired while ioredis was still reconnecting
- `packages/functions/src/services/redis.service.js:27` — retryStrategy times*200 capped at 2000ms — ioredis reconnects on its own, which the 03:25:46.723 'connected' line confirms
- `packages/functions/src/services/redis.service.js:74` — the 'ready' handler calls clearTransientState(), so a successful reconnect is the only thing that can retract the escalation state

## Evidence
- 2 matching entries: `(resource.labels.service_name="auth" OR resource.labels.function_name="auth") AND timestamp>="2026-08-21T03:09:55.784Z" AND timestamp<="2026-08-21T03:39:55.784Z" AND jsonPayload.message:"sustained connection outage 0 consecutive"`
- 8 matching entries: `(resource.labels.service_name="auth" OR resource.labels.function_name="auth") AND timestamp>="2026-08-21T03:09:55.784Z" AND timestamp<="2026-08-21T03:39:55.784Z" AND jsonPayload.message:"connection error ETIMEDOUT"`
- 1 matching entries: `(resource.labels.service_name="auth" OR resource.labels.function_name="auth") AND timestamp>="2026-08-21T03:09:55.784Z" AND timestamp<="2026-08-21T03:39:55.784Z" AND jsonPayload.message:"[redis.service] connected"`
- 39 matching entries: `timestamp>="2026-08-21T03:20:00Z" AND timestamp<="2026-08-21T03:32:00Z" AND jsonPayload.tag="[redis.service]" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.17

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
