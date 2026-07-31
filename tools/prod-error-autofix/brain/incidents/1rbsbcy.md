fingerprint: 1rbsbcy
service: apiv2
message: [redis.service] connection error ECONNRESET read ECONNRESET
app: BLOG
repo: blogs
date: 2026-07-31T09:47:11.988Z
status: mr_open
attempt: 1

# BLOG · apiv2 · 1rbsbcy

**Outcome.** duplicate of 1wkwfie — MR https://gitlab.com/avada/blogs/-/merge_requests/808

**Root cause.** The idle ioredis socket from the apiv2 instance to Memorystore 10.68.191.235 was reset once (ECONNRESET) while the instance was serving no traffic; ioredis reconnected 3.24s later on its own and no request failed, but redis.service.js logs every socket error at logger.error, so a self-healed reconnect is stamped severity=ERROR and pages the prod-error-alerts sink.

**Mechanism.** apiv2 egresses to Memorystore through the Serverless VPC connector (globalOptions.js sets vpcConnectorEgressSettings PRIVATE_RANGES_ONLY). The ioredis client is constructed once at module load with no keepAlive option (packages/functions/src/services/redis.service.js:28 sets connectTimeout only, so ioredis v5 default keepAlive=0), leaving an idle TCP flow for the connector NAT to reap. On instance 001548f7297de6e0 the socket had been up since 09:18:10.573 (its 'connected' line) and was reset at 09:32:59.711 — 14m49s later, with zero apiv2 request logs anywhere between 09:31:00 and 09:35:00, nearest request 121s afterwards at 09:35:00.719. ioredis's 'error' handler at redis.service.js:37 calls logger.error unconditionally (only throttled to 1 per 30s per instance); helpers/logger.js:61 emits a `severity` field, so the line is ingested as severity=ERROR and matches the sink filter severity>=ERROR. retryStrategy (redis.service.js:29, times*200 capped at 2000ms) reconnected and the 'ready' handler (redis.service.js:40) logged 'connected 10.68.191.235' at 09:33:02.950 — 3.239s after the error, same instanceId. Nothing downstream degraded: the two fail-open paths would have logged their own tags and neither appears in the window — withCache catches a redis get failure and calls fetchFn() (shopCache.service.js:103) and rateLimiterMiddleware logs 'fallback allow' and calls next() (ratelimiter.js:70). So the failure the alert describes is the log line itself, not a request. The single 500 in the window (09:35:09.984 POST /apiV2/langgraph/blog, 1.109s) is an unrelated second cause on a different instance: its execution 8qy6r58rl07t logged `Error: 16 UNAUTHENTICATED: Request had invalid authentication credentials` at 09:35:11.093, exactly 1.109s after the request start, on an instance that had cold-started 0.34s earlier (its own 'connected' at 09:35:09.640) — pattern P6, not the redis reset.

Confidence: `high`

## Code
- `packages/functions/src/services/redis.service.js:37` — logger.error fires on every ioredis 'error' including a transient ECONNRESET the client recovers from — emits the exact string in the alert
- `packages/functions/src/services/redis.service.js:29` — retryStrategy times*200 capped at 2000ms — the automatic reconnect that makes this error self-healing
- `packages/functions/src/services/redis.service.js:40` — 'ready' handler logs at warn; its line 3.239s after the error is the proof of recovery
- `packages/functions/src/services/redis.service.js:28` — socket options set connectTimeout but no keepAlive, so ioredis v5 default keepAlive=0 leaves idle flows to be reaped by the VPC connector
- `packages/functions/src/globalOptions.js:10` — vpcConnectorEgressSettings PRIVATE_RANGES_ONLY — the connector path the reset TCP flow traverses
- `packages/functions/src/services/shopCache.service.js:103` — withCache catches a redis get failure and falls through to fetchFn() — cache path is fail-open, produces no 5xx
- `packages/functions/src/middleware/ratelimiter.js:70` — rate limiter treats a redis Error as 'fallback allow' and calls next() — request path is fail-open too
- `packages/functions/src/helpers/logger.js:61` — logger emits `severity`, which is why this transient redis warning reaches the severity>=ERROR sink at all

## Evidence
- 12 matching entries: `(resource.labels.service_name="apiv2" OR resource.labels.function_name="apiv2") AND timestamp>="2026-07-30T10:00:00Z" AND timestamp<="2026-07-31T10:00:00Z" AND jsonPayload.tag="[redis.service]"`
- 9 matching entries: `(resource.labels.service_name="apiv2" OR resource.labels.function_name="apiv2" OR resource.labels.job_name="apiv2") AND timestamp>="2026-07-31T09:18:01.516Z" AND timestamp<="2026-07-31T09:48:01.516Z" AND logName:"stderr"`
- 5 matching entries: `(resource.labels.service_name="apiv2" OR resource.labels.function_name="apiv2") AND timestamp>="2026-07-31T09:18:01Z" AND timestamp<="2026-07-31T09:48:01Z" AND httpRequest.requestMethod!=""`
- 3 matching entries: `(resource.labels.service_name="apiv2" OR resource.labels.function_name="apiv2" OR resource.labels.job_name="apiv2") AND timestamp>="2026-07-31T09:18:01.516Z" AND timestamp<="2026-07-31T09:48:01.516Z" AND severity>=ERROR`

## Job
- analyze rounds: 1
- cost: $1.03
- MR: https://gitlab.com/avada/blogs/-/merge_requests/808

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
