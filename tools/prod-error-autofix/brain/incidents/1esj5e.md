fingerprint: 1esj5e
service: embedappgen2
message: HTTP 500 GET /embed
app: SEO
repo: seo
date: 2026-09-01T17:17:21.114Z
status: infra
attempt: 2

# SEO · embedappgen2 · 1esj5e

**Outcome.** infra class — reported, no MR

**Root cause.** Infra, not code: a platform-side container-start fault in avada-seo/us-central1 during 2026-09-01T17:05–17:16Z made embedappgen2 cold-start containers fail the Cloud Run STARTUP TCP probe with DEADLINE_EXCEEDED, so Cloud Run answered the queued /embed requests with 503 readiness-check failures and rejected one at admission with a 500 at latency 0s.

**Mechanism.** embedAppGen2 is declared at packages/functions/src/handlers/exports/httpFunctions.js:29 with minInstances 1 in production and no concurrency override, so the ~30-request burst at 17:08Z forced Cloud Run to scale out revision embedappgen2-00352-hin. Five of those cold-start containers never bound :8080: five 'Default STARTUP TCP probe failed 1 time consecutively for container "worker" on port 8080. The instance was not started. Connection failed with status DEADLINE_EXCEEDED.' entries at 17:07:59, 17:11:02, 17:11:55, 17:13:51, 17:15:13Z. Two of those instance IDs map one-to-one onto the alerted 503s: instance 00a41e8c1d645eec… probe-failed at 17:11:02.117819Z and its queued request 17:05:59.877644Z returned 503 after 245.114122s; instance 00a41e8c1d322a6e… probe-failed at 17:11:55.924968Z and its queued request 17:06:36.046736Z returned 503 after 241.143920s — the request sat in the Cloud Run queue for the full container-start attempt and got 'The request failed because the instance failed the readiness check.' The alerted 500 (17:07:39.230297Z) carries latency 0s, responseSize absent and NO instanceId label, i.e. it never reached a container — an admission rejection during the same fault. The fault is not specific to this service: 45 STARTUP-probe failures across 13 distinct avada-seo Cloud Run services (changelogtriggers-shops 10, authsagen2 8, webhookpublishthemegen2 5, embedappgen2 5, bulkauditfixapplygen2 4, …) fired in the same 16:50–17:30Z window, matching the already-recorded 2026-09-01 platform fault fingerprints (1qj4dz7, 1sc23g3, 15bqjgv, 9y4a2r). Application code is excluded by measurement, not assumption: the /embed handler's only blocking I/O is the embed-template fetch at packages/functions/src/handlers/embed.js:34, and 68 requests in the same 30-minute window returned 200 at 0.11–0.52s, so that fetch was healthy throughout; stderr is empty (0 entries) and there is no application log line anywhere near the failures, consistent with the container dying before app code runs. The whole 5xx set for 24h is these five events (4× 503 at 241–258s, 1× 500 at 0s), all inside 17:05:59–17:09:49Z.

Confidence: `high` · infra class, not auto-fixed

## Code
- `packages/functions/src/handlers/exports/httpFunctions.js:29` — embedAppGen2 = onRequest({memory:'1GiB', minInstances: isProduction ? 1 : 0, region, ...vpcSettings}) — one warm instance, no concurrency cap, so a request burst forces the cold starts that the platform fault then killed at the STARTUP probe.
- `packages/functions/src/handlers/embed.js:34` — The handler's only blocking I/O (fetch of the embed template). Named to exclude it: 68 requests in the same window served 200 in 0.11–0.52s, so this path was not the cause of these five 5xx.

## Evidence
- 5 matching entries: `(resource.labels.service_name="embedappgen2") AND timestamp>="2026-09-01T16:57:23.113Z" AND timestamp<="2026-09-01T17:27:23.113Z" AND textPayload:"STARTUP TCP probe failed"`
- 45 matching entries: `resource.type="cloud_run_revision" AND timestamp>="2026-09-01T16:50:00Z" AND timestamp<="2026-09-01T17:30:00Z" AND textPayload:"STARTUP TCP probe failed"`
- 5 matching entries: `(resource.labels.service_name="embedappgen2") AND timestamp>="2026-08-31T17:27:23Z" AND timestamp<="2026-09-01T17:27:23Z" AND logName:"requests" AND httpRequest.status>=500`
- 68 matching entries: `(resource.labels.service_name="embedappgen2") AND timestamp>="2026-09-01T16:57:23.113Z" AND timestamp<="2026-09-01T17:27:23.113Z" AND logName:"requests" AND httpRequest.status=200`

## Job
- analyze rounds: 2
- cost: $2.81

## Verdict

_Filled in by hand once the MR is reviewed. A rejected fix recorded here is what stops the
next job proposing it again._
