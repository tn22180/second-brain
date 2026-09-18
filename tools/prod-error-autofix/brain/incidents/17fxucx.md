fingerprint: 17fxucx
service: syncsubscribeactivecharge
message: [redis.service] sustained connection outage no reconnect within 10000ms of ECONNRESET
app: BLOG
repo: blogs
date: 2026-09-18T09:34:56.377Z
status: fix_disabled
attempt: 1

# BLOG · syncsubscribeactivecharge · 17fxucx

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** No request failed. redis.service.js turns a self-healing idle-socket ECONNRESET into a severity=ERROR page using a one-shot 10s setTimeout that never checks the client's real state. The timer fired at 09:33:50.558Z; ioredis reconnected 4.499s later at 09:33:55.058Z. This is the same defect family already recorded as 493wip / 1aihw98 / 1l8e49w / 1yq6npy / 1m4c9me / e6i8uy, so there is no new cause.

**Mechanism.** Cloud Scheduler's */30 tick started one syncsubscribeactivecharge instance at 09:30:09.878Z. On that cold start, redis.service.js built its ioredis client at module load and logged 'connected 34.60.93.33' at 09:30:26.937Z. The only request in the window came back HTTP 200 with latency 18.86s, so the only work in the window ended at about 09:30:28.7Z. After that the container sat idle and CPU-throttled (cpu: 0.5, no minInstances). About 184s later, at 09:33:32.757Z, the idle flow to Memorystore 34.60.93.33 was reset. The error handler logged 'connection error ECONNRESET' at warn (redis.service.js:46) and armed the one-shot escalation timer (redis.service.js:49, TRANSIENT_GRACE_MS=10000 at :31). The timer fired at 09:33:50.558Z, 17,801ms after the reset instead of 10,000ms (+78%). That drift fits a throttled event loop with nothing in flight. The timer callback called logger.error (redis.service.js:51) with no check of redis.status. Only a 'ready' event arriving before the timer can cancel it. 'ready' arrived at 09:33:55.058Z (redis.service.js:74), 22.3s after the reset and 4.5s after the page. So the alerted claim 'no reconnect within 10000ms' describes a connection that came back on its own. retryStrategy schedules the first reconnect 200ms after a reset (:27). A 22s gap therefore means a stalled loop on an idle instance, not a failing retry ladder. The window has zero 5xx request logs and no application error other than this line. Whether Slack gets paged depends on how the throttled timer races the reconnect, not on whether any work broke.

Confidence: `high`

## Code
- `packages/functions/src/services/redis.service.js:49` — One-shot setTimeout, armed on the first ECONNRESET and never re-validated. It is what fired the alert.
- `packages/functions/src/services/redis.service.js:51` — logger.error runs unconditionally inside the timer callback, with no redis.status check before paging.
- `packages/functions/src/services/redis.service.js:31` — TRANSIENT_GRACE_MS = 10000 is the constant quoted in the alert. Observed firing was 17,801ms on a throttled instance.
- `packages/functions/src/services/redis.service.js:74` — The 'ready' handler logged 'connected 34.60.93.33' at 09:33:55.058Z, after the page, proving the connection self-healed.
- `packages/functions/src/services/redis.service.js:27` — retryStrategy uses times*200ms, so the first reconnect is due 200ms after the reset. A 22s reconnect gap means a stalled event loop.
- `packages/functions/src/functions/scheduled.js:7` — syncSubscribeActiveCharge runs every 30 min with cpu: 0.5, maxInstances: 1 and no minInstances. The instance idles CPU-throttled between ticks, which delays both the timer and the reconnect.

## Evidence
- 4 matching entries: `resource.labels.service_name="syncsubscribeactivecharge" AND timestamp>="2026-09-18T09:18:57.585Z" AND timestamp<="2026-09-18T09:48:57.585Z" AND jsonPayload.tag="[redis.service]"`
- 1 matching entries: `resource.labels.service_name="syncsubscribeactivecharge" AND timestamp>="2026-09-18T09:18:57.585Z" AND timestamp<="2026-09-18T09:48:57.585Z" AND severity>=ERROR`
- 1 matching entries: `resource.labels.service_name="syncsubscribeactivecharge" AND timestamp>="2026-09-18T09:18:57.585Z" AND timestamp<="2026-09-18T09:48:57.585Z" AND logName:"requests"`
- 1 matching entries: `timestamp>="2026-09-18T00:00:00Z" AND timestamp<="2026-09-19T00:00:00Z" AND jsonPayload.tag="[redis.service]" AND jsonPayload.message:"sustained connection outage"`

## Job
- analyze rounds: 1
- cost: $1.13

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
