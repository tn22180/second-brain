fingerprint: 1wkwfie
service: api
message: [redis.service] connection error ECONNRESET read ECONNRESET
app: BLOG
repo: blogs
date: 2026-07-31T09:44:36.410Z
status: mr_open
attempt: 1

# BLOG · api · 1wkwfie

**Outcome.** MR opened: https://gitlab.com/avada/blogs/-/merge_requests/808

**Root cause.** The pooled ioredis socket to Memorystore 10.68.191.235 was reset (ECONNRESET) three times in 24h; ioredis reconnected on its own within 0.22–3.0s and no request failed, but redis.service.js logs every socket error at logger.error, so a self-healed reconnect is stamped severity=ERROR and pages the prod-error-alerts sink.

**Mechanism.** The TCP flow from the api instance to Memorystore, egressing through the Serverless VPC connector (globalOptions.js sets vpcConnectorEgressSettings PRIVATE_RANGES_ONLY), is dropped by the connector NAT/Memorystore side. ioredis emits 'error' with code ECONNRESET; the handler at packages/functions/src/services/redis.service.js:37 calls logger.error unconditionally (only rate-limited to 1 per 30s per instance). helpers/logger.js emits a `severity` field, so the line lands as severity=ERROR and matches the sink filter severity>=ERROR. Meanwhile retryStrategy (redis.service.js:29) reconnects and 'ready' fires (redis.service.js:40) — logged at WARNING — 0.22s, 0.22s and 3.00s after the three errors respectively. Nothing downstream breaks: withCache catches and calls fetchFn() (shopCache.service.js:103) and rateLimiterMiddleware logs 'fallback allow' and calls next() (ratelimiter.js:70), and neither of those tags appears anywhere in the window. Confirmed by request logs: 9 non-2xx responses between 09:25 and 09:45, all at 09:26:52–09:27:58 and 09:33:42, none within 60s of any of the three resets. So the failure the alert describes is the log line itself, not a request.

Confidence: `high`

## Code
- `packages/functions/src/services/redis.service.js:37` — logger.error on every ioredis 'error', including transient ECONNRESET that the client recovers from — this is the exact string in the alert
- `packages/functions/src/services/redis.service.js:29` — retryStrategy times*200 capped at 2000ms — the automatic reconnect that makes the error self-healing
- `packages/functions/src/services/redis.service.js:40` — 'ready' handler logs at warn; its 3 log lines 0.22–3.0s after each error prove the recovery
- `packages/functions/src/services/redis.service.js:28` — socket options block has connectTimeout but no keepAlive, so ioredis v5 default keepAlive=0 leaves idle flows to be reaped by the VPC connector
- `packages/functions/src/services/shopCache.service.js:103` — withCache catches a redis get failure and falls through to fetchFn() — cache path is fail-open, no 5xx
- `packages/functions/src/middleware/ratelimiter.js:70` — rate limiter treats a redis Error as 'fallback allow' and calls next() — request path is fail-open too
- `packages/functions/src/helpers/logger.js:17` — logger emits severity, which is why this app's transient redis warning reaches the severity>=ERROR sink at all

## Evidence
- 10 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-31T09:16:11Z" AND timestamp<="2026-07-31T09:46:11Z" AND jsonPayload.tag="[redis.service]"`
- 3 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-30T10:00:00Z" AND timestamp<="2026-07-31T10:00:00Z" AND jsonPayload.tag="[redis.service]" AND severity>=ERROR`
- 9 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-07-31T09:25:00Z" AND timestamp<="2026-07-31T09:45:00Z" AND httpRequest.status>=400`
- 43 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api" OR resource.labels.job_name="api") AND timestamp>="2026-07-31T09:16:11.355Z" AND timestamp<="2026-07-31T09:46:11.355Z" AND logName:"stderr"`

## Job
- analyze rounds: 2
- cost: $3.29
- branch: `fix/prod-blog-1wkwfie`
- fix commit: `0a7e71c7cd8be9e1c45108ae133a7b1b7d88a6a6`
- MR: https://gitlab.com/avada/blogs/-/merge_requests/808
- tests: 243 tests, 3 failing · baseline 3 failing · reproduce test fails without the fix

```
packages/functions/src/services/redis.service.js | 48 +++++++++++++++++++++++-
 1 file changed, 47 insertions(+), 1 deletion(-)
```

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
