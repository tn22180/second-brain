fingerprint: vjtmj2
service: api
message: [ShopCacheService.getByField] <http://gianbighand-swadle.myshopify.com|gianbighand-swadle.myshopify.com> redis set failed Reached the max retries per request limit (which is 2). Refer to "maxRetriesPerRequest" option for details.
app: BLOG
repo: blogs
date: 2026-08-22T06:53:14.321Z
status: fix_disabled
attempt: 1

# BLOG · api · vjtmj2

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** Duplicate of the recorded Memorystore-outage family (e6i8uy / w7q35f / 1kwz9uf / y2tcey): a ~56-second Memorystore outage (34.60.93.33:6380, first ETIMEDOUT 2026-08-21T03:24:42.431Z → last reconnect 03:25:38.829Z) made every ioredis command on `api` fail after maxRetriesPerRequest:2, and ShopCacheService.getByField and withCache log that already-handled, degraded-but-successful Firestore fallback at logger.error, so severity=ERROR reached the sink while no request failed.

**Mechanism.** redis.service.js:22 sets maxRetriesPerRequest:2, so while the connection is down each GET/SET rejects with 'Reached the max retries per request limit (which is 2)'. The alerted line is shopCache.service.js:182 — the catch around the SET/SADD/EXPIRE block in getByField — which logs at logger.error and then falls straight through to `return data` on line 185; the shop was already fetched from Firestore by fetchFn() at line 157, so the caller got its answer. Same shape for the other redis ERRORs in the window: 1× the sibling get-failed catch at shopCache.service.js:153 (execution continues to fetchFn() on line 157) and 5× withCache's get-failed catch at shopCache.service.js:102, which has `return fetchFn()` on the very next line — the fallback is the designed path. Proof nothing failed: the httpRequest.status>=500 read returned 0 entries across the whole 30-minute window, and 4 '[redis.service] connected 34.60.93.33' lines land inside it, the last at 03:25:38.829Z, i.e. ioredis self-healed. 23 of the 26 ERRORs in the window are this outage (14 redis.service escalation lines + 5 withCache + 2 getByField + 2 ECONNREFUSED escalations); the remaining 3 are unrelated and already recorded elsewhere (2× getShopifyArticleById 'Article not found' at 03:30:04Z = fingerprint 7u4qve, 1× Shopify 'Throttled' at 03:16:07Z). Secondary defect in the same file: redis.service.js:59 calls clearTransientState(), which zeroes transientErrorCount, before the template literal at line 63 interpolates it — which is why all 9 escalation lines read literally 'sustained connection outage 0 consecutive ETIMEDOUT', a count that can never print anything but 0. The Memorystore/VPC-connector outage itself is infra and not fixable in this repo; the fixable part is that a handled fallback is logged at error severity.

Confidence: `high`

## Code
- `packages/functions/src/services/shopCache.service.js:182` — exact line in the alert — handled cache-write failure logged at logger.error, then `return data` on line 185; the shop was already resolved by fetchFn() at line 157
- `packages/functions/src/services/shopCache.service.js:153` — sibling get-failed catch, 1 ERROR in the window; execution falls through to fetchFn()
- `packages/functions/src/services/shopCache.service.js:102` — withCache get-failed catch, 5 of the 26 ERRORs in the window, with `return fetchFn()` on the next line — the fallback is the designed path
- `packages/functions/src/services/redis.service.js:22` — maxRetriesPerRequest: 2 is the source of the 'which is 2' text carried in the alert message
- `packages/functions/src/services/redis.service.js:59` — clearTransientState() zeroes transientErrorCount before line 63 interpolates it, which is why all 9 escalation lines report '0 consecutive'
- `packages/functions/src/services/redis.service.js:74` — the 'ready' handler that emitted the 4 '[redis.service] connected' lines inside the window — ioredis reconnected on its own

## Evidence
- 1 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-21T03:10:07.201Z" AND timestamp<="2026-08-21T03:40:07.201Z" AND jsonPayload.message:"redis set failed"`
- 5 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-21T03:10:07.201Z" AND timestamp<="2026-08-21T03:40:07.201Z" AND jsonPayload.message:"[withCache]"`
- 27 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-21T03:10:07.201Z" AND timestamp<="2026-08-21T03:40:07.201Z" AND jsonPayload.message:"[redis.service] connection error"`
- 4 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-21T03:10:07.201Z" AND timestamp<="2026-08-21T03:40:07.201Z" AND jsonPayload.message:"[redis.service] connected"`
- 9 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-21T03:10:07.201Z" AND timestamp<="2026-08-21T03:40:07.201Z" AND jsonPayload.message:"sustained connection outage 0 consecutive"`

## Job
- analyze rounds: 1
- cost: $1.46

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
