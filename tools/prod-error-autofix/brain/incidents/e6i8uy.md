fingerprint: e6i8uy
service: api
message: [ShopCacheService.getByField] <http://gianbighand-swadle.myshopify.com|gianbighand-swadle.myshopify.com> redis get failed Reached the max retries per request limit (which is 2). Refer to "maxRetriesPerRequest" option for details.
app: BLOG
repo: blogs
date: 2026-08-22T06:29:07.400Z
status: fix_disabled
attempt: 1

# BLOG · api · e6i8uy

**Outcome.** fix lane disabled — analysed and reported, no MR

**Root cause.** A 56-second Memorystore outage (34.60.93.33:6380, 03:24:42.4Z→03:25:38.8Z) made every ioredis command fail after maxRetriesPerRequest:2, and ShopCacheService/withCache log that already-handled cache-miss fallback at logger.error, so a degraded-but-successful request path emitted severity=ERROR and tripped the prod-error sink; no request failed.

**Mechanism.** redis.service.js:22 sets maxRetriesPerRequest:2, so during the outage each GET/SET rejects with 'Reached the max retries per request limit (which is 2)'. shopCache.service.js:152-154 catches that rejection inside getByField and falls through to fetchFn() at line 157 — the shop is still served from Firestore — but the catch calls logger.error, and this app's logger emits severity (BLOG is the only app with the severity fix), so the sink matched it and alerted. Same pattern in withCache at shopCache.service.js:101-104 (return fetchFn() on the next line). Evidence the path was non-fatal: the requests read (httpRequest.status>=500) returned 0 entries for the whole 30-minute window, and all three warm instances logged '[redis.service] connected 34.60.93.33' by 03:25:38.8Z. Secondary code defect in the same window: redis.service.js:59 calls clearTransientState() (which zeroes transientErrorCount) before the template literal at line 63 reads it, so the escalation line always prints '0 consecutive <code>' — 9 of 16 escalation ERRORs in the window say literally '0 consecutive ETIMEDOUT/ECONNREFUSED', a count that can never be anything but 0. The Memorystore/VPC-connector outage itself is infra and not fixable in this repo.

Confidence: `high`

## Code
- `packages/functions/src/services/shopCache.service.js:153` — the exact log line in the alert: handled cache-read failure logged at logger.error, then execution falls through to fetchFn() at line 157
- `packages/functions/src/services/shopCache.service.js:102` — same defect in withCache — logger.error immediately before 'return fetchFn()' on line 103; 5 of the 7 cache ERRORs in the window came from here
- `packages/functions/src/services/redis.service.js:22` — maxRetriesPerRequest: 2 is the source of the 'which is 2' message text in the alert
- `packages/functions/src/services/redis.service.js:59` — clearTransientState() zeroes transientErrorCount before line 63 interpolates it, which is why all 9 escalation lines report '0 consecutive'

## Evidence
- 7 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-21T03:09:54.921Z" AND timestamp<="2026-08-21T03:39:54.921Z" AND severity>=ERROR AND jsonPayload.message:"max retries per request limit"`
- 27 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-21T03:09:54.921Z" AND timestamp<="2026-08-21T03:39:54.921Z" AND jsonPayload.message:"[redis.service] connection error"`
- 4 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-21T03:09:54.921Z" AND timestamp<="2026-08-21T03:39:54.921Z" AND jsonPayload.message:"[redis.service] connected"`
- 9 matching entries: `(resource.labels.service_name="api" OR resource.labels.function_name="api") AND timestamp>="2026-08-21T03:09:54.921Z" AND timestamp<="2026-08-21T03:39:54.921Z" AND jsonPayload.message:"sustained connection outage 0 consecutive"`

## Job
- analyze rounds: 2
- cost: $2.30

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
