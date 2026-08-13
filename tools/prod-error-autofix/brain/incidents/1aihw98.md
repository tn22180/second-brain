fingerprint: 1aihw98
service: subscribesummarynewpublishedarticle
message: [redis.service] sustained connection outage no reconnect within 10000ms of ECONNRESET
app: BLOG
repo: blogs
date: 2026-08-12T14:32:45.657Z
status: mr_open
attempt: 1

# BLOG · subscribesummarynewpublishedarticle · 1aihw98

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/869

**Root cause.** packages/functions/src/services/redis.service.js escalates a transient ECONNRESET to logger.error from a wall-clock setTimeout(10000), but on a Cloud Run instance whose CPU is throttled after the request completes both that timer and ioredis's own reconnect run at throttled speed, so an idle-socket reset that self-heals gets stamped severity=ERROR and pages even though the instance was serving zero requests.

**Mechanism.** The instance cold-started for one Pub/Sub push at 2026-08-07T11:41:34.732Z (single request log, HTTP 200, 13.01s) and served nothing afterwards. redis.service.js builds its ioredis client at module load (src/index.js:8 re-exports functions/pubsub.js, so every container constructs it) even though subscribeHandleSummaryNewPublishedArticle never touches redis. 158.0s after the connection went ready (11:41:47.952Z), the VPC-connector NAT dropped the idle Memorystore flow: 'connection error ECONNRESET read ECONNRESET' at 11:44:25.975Z, logged at warn (redis.service.js:46) and arming the escalation timer (redis.service.js:49, TRANSIENT_GRACE_MS=10000 at :31). With no request in flight the container has no CPU allocation, so the event loop advanced slowly: the 10,000ms timer fired at 11:44:41.076Z — 15,100ms later, 51% drift, which a running event loop does not produce — and ioredis's retryStrategy (times*200ms, i.e. a 200ms first retry) did not complete a reconnect until 11:44:49.785Z, 23,810ms after the reset and 8,709ms after the escalation already paged. No intervening 'error' event exists in that 23.8s gap, so no retry attempt ran either: the loop was frozen, not failing. The 'ready' handler (redis.service.js:74) then cleared state and logged 'connected'. The message's own claim ('no reconnect within 10000ms') is false — it reconnected, just on throttled-CPU wall clock.

Confidence: `high`

## Code
- `packages/functions/src/services/redis.service.js:49` — setTimeout-based escalation to logger.error — the line that fired the alert; a wall-clock timer on a CPU-throttled instance
- `packages/functions/src/services/redis.service.js:31` — TRANSIENT_GRACE_MS = 10000, the window the log message quotes; observed firing at 15,100ms
- `packages/functions/src/services/redis.service.js:56` — grace window passed to setTimeout; assumes the event loop runs at real time between invocations
- `packages/functions/src/services/redis.service.js:74` — 'ready' handler clears state and logged 'connected' 8.7s AFTER the escalation — proof the outage self-healed
- `packages/functions/src/functions/pubsub.js:67` — subscribeSummaryNewPublishedArticle declared with no minInstances and no CPU-always-on, so the instance is throttled to ~0 CPU between pushes
- `packages/functions/src/handlers/pubsub/subscribeHandleSummaryNewPublishedArticle.js:10` — the handler imports no redis path at all — this container's Memorystore connection is never used, so the reset could not have failed any work
- `packages/functions/src/index.js:8` — exports functions/pubsub.js from the single bundle, so redis.service.js's module-level client is constructed in every function container including redis-free subscribers

## Evidence
- 7 matching entries: `resource.labels.service_name="subscribesummarynewpublishedarticle" AND timestamp>="2026-08-07T11:38:00Z" AND timestamp<="2026-08-07T11:50:00Z"`
- 1 matching entries: `resource.labels.service_name="subscribesummarynewpublishedarticle" AND timestamp>="2026-08-07T11:38:00Z" AND timestamp<="2026-08-07T11:50:00Z" AND logName:"requests"`
- 18 matching entries: `resource.labels.service_name="subscribesummarynewpublishedarticle" AND timestamp>="2026-08-07T00:00:00Z" AND timestamp<="2026-08-08T00:00:00Z" AND jsonPayload.tag="[redis.service]"`
- 1 matching entries: `(resource.labels.service_name="subscribesummarynewpublishedarticle" OR resource.labels.function_name="subscribesummarynewpublishedarticle") AND timestamp>="2026-08-07T11:30:00.769Z" AND timestamp<="2026-08-07T12:00:00.769Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $4.48
- branch: `fix/prod-blog-1aihw98`
- fix commit: `c8df25a0debabd0d68700c98fb4d44404fde65a0`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/869
- tests: 359 tests, 1 failing · baseline 2 failing · reproduce test fails without the fix

```
.../src/services/__tests__/redis.service.test.js   | 74 +++++++++++++++++++---
 packages/functions/src/services/redis.service.js   | 37 +++++++----
 2 files changed, 90 insertions(+), 21 deletions(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
